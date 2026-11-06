import { PatchStateMachine } from '../workers/state-machine.ts';
import { PatchError, formatDeviceLimit, type ErrorCode } from '../lib/errors.ts';
import { estimateMemoryMB, deviceLimitVerdict, type Capabilities } from '../lib/capabilities.ts';
import type { ProgressPhase, WorkerResponse, JobId } from '../workers/protocol.ts';
import { newJobId } from '../workers/protocol.ts';

export interface PatcherRunner {
  prepare(jobId: JobId, rom: File, manifestUrl: string): Promise<void>;
  start(jobId: JobId): Promise<void>;
  cancel(jobId: JobId): void;
  onMessage(handler: (msg: WorkerResponse) => void): void;
  getResult(): Blob | null;
  dispose(): void;
}

export interface PanelDeps {
  root: Document | HTMLElement;
  runner: PatcherRunner;
  manifestUrl: string;
  capabilities: Capabilities;
  passive?: boolean;
}

const PHASE_LABEL: Record<ProgressPhase, string> = {
  hashing: 'Checking your file…',
  fetching: 'Fetching translation data…',
  decrypting: 'Unlocking translation data…',
  patching: 'Assembling the English ROM…',
  validating: 'Verifying the result…',
};

const STAGE_ORDER: ProgressPhase[] = [
  'hashing',
  'fetching',
  'decrypting',
  'patching',
  'validating',
];

const STAGE_SHORT: Record<ProgressPhase, string> = {
  hashing: 'Check file',
  fetching: 'Fetch data',
  decrypting: 'Unlock data',
  patching: 'Build ROM',
  validating: 'Verify',
};

const STAGE_DONE = 4;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export class PatcherPanel {
  #root: Document | HTMLElement;
  #runner: PatcherRunner;
  #manifestUrl: string;
  #caps: Capabilities;
  #machine = new PatchStateMachine();

  #jobId: JobId | null = null;
  #file: File | null = null;
  #prepared: { romSha256: string; romSizeBytes: number; expectedOutputBytes: number; outputFileName: string } | null = null;
  #phase: ProgressPhase | null = null;
  #fraction = 0;
  #error: PatchError | null = null;
  #resultBlobUrl: string | null = null;
  #resultInfo: { fileName: string; sizeBytes: number } | null = null;
  #beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

  constructor(deps: PanelDeps) {
    this.#root = deps.root;
    this.#runner = deps.runner;
    this.#manifestUrl = deps.manifestUrl;
    this.#caps = deps.capabilities;

    this.#runner.onMessage((msg) => this.#handleMessage(msg));

    if (!deps.passive) {
      this.#attach();
    }
  }

  #q<T extends HTMLElement>(sel: string): T | null {
    const el =
      this.#root instanceof Document
        ? this.#root.querySelector<T>(sel)
        : (this.#root as HTMLElement).querySelector<T>(sel);
    return el;
  }

  #attach(): void {
    const panel = this.#q<HTMLElement>('#patcher-panel');
    if (!panel) return;

    panel.addEventListener('change', (e) => {
      const input = (e.target as HTMLElement | null)?.closest<HTMLInputElement>('#rom-input');
      if (!input) return;
      const file = input.files?.[0];
      if (file) void this.selectFile(file);
    });

    for (const type of ['dragenter', 'dragover'] as const) {
      panel.addEventListener(type, (e) => {
        const drop = (e.target as HTMLElement | null)?.closest<HTMLElement>('#drop-zone');
        if (!drop) return;
        e.preventDefault();
        drop.classList.add('is-dragover');
      });
    }
    for (const type of ['dragleave', 'dragend'] as const) {
      panel.addEventListener(type, (e) => {
        const drop = (e.target as HTMLElement | null)?.closest<HTMLElement>('#drop-zone');
        drop?.classList.remove('is-dragover');
      });
    }
    panel.addEventListener('drop', (e) => {
      const drop = (e.target as HTMLElement | null)?.closest<HTMLElement>('#drop-zone');
      if (!drop) return;
      e.preventDefault();
      drop.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) void this.selectFile(file);
    });

    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const action = target?.closest<HTMLElement>('[data-action]')?.dataset['action'];
      if (!action) return;
      if (action === 'choose-again') this.resetToIdle();
      if (action === 'patch') void this.startPatching();
      if (action === 'cancel') this.cancel();
      if (action === 'rebuild') this.rebuild();
      if (action === 'download') this.download();
    });
  }

  async selectFile(file: File): Promise<void> {
    this.#clearResult();
    this.#error = null;
    this.#prepared = null;
    this.#phase = null;
    this.#fraction = 0;
    this.#file = file;
    this.#machine.reset();
    this.#machine.transition('hashing');
    this.#jobId = newJobId();
    this.#mountBeforeUnload();
    this.#render();

    try {
      await this.#runner.prepare(this.#jobId, file, this.#manifestUrl);
    } catch (e) {
      this.#fail(e);
    }
  }

  async startPatching(): Promise<void> {
    if (!this.#machine.canTransition('fetching')) return;
    if (!this.#jobId) return;
    this.#machine.transition('fetching');
    this.#error = null;
    this.#render();
    try {
      await this.#runner.start(this.#jobId);
    } catch (e) {
      this.#fail(e);
    }
  }

  rebuild(): void {
    if (this.#machine.state !== 'done') return;
    this.#clearResult();
    this.#machine.transition('verified');
    this.#render();
    void this.startPatching();
  }

  cancel(): void {
    if (!this.#jobId) return;
    this.#runner.cancel(this.#jobId);
  }

  resetToIdle(): void {
    this.#clearResult();
    this.#machine.reset();
    this.#jobId = null;
    this.#file = null;
    this.#prepared = null;
    this.#phase = null;
    this.#fraction = 0;
    this.#error = null;
    this.#unmountBeforeUnload();
    this.#render();
    const input = this.#q<HTMLInputElement>('#rom-input');
    if (input) input.value = '';
  }

  download(): void {
    if (this.#machine.state !== 'done' || !this.#resultBlobUrl || !this.#resultInfo) return;
    const a = this.#root instanceof Document
      ? this.#root.createElement('a')
      : (this.#root as HTMLElement).ownerDocument.createElement('a');
    a.href = this.#resultBlobUrl;
    a.download = this.#resultInfo.fileName;
    a.click();
  }

  #handleMessage(msg: WorkerResponse): void {
    if (msg.jobId !== this.#jobId) return;

    switch (msg.type) {
      case 'prepared': {
        this.#prepared = {
          romSha256: msg.romSha256,
          romSizeBytes: msg.romSizeBytes,
          expectedOutputBytes: msg.expectedOutputBytes,
          outputFileName: msg.outputFileName,
        };
        if (this.#machine.canTransition('verified')) {
          this.#machine.transition('verified');
        }
        this.#unmountBeforeUnload();
        this.#render();
        break;
      }
      case 'progress': {
        this.#phase = msg.phase;
        this.#fraction = msg.fraction;
        const map: Record<ProgressPhase, Parameters<PatchStateMachine['transition']>[0]> = {
          hashing: 'hashing',
          fetching: 'fetching',
          decrypting: 'decrypting',
          patching: 'patching',
          validating: 'validating',
        };
        const target = map[msg.phase];
        if (target && this.#machine.canTransition(target)) {
          this.#machine.transition(target);
        }
        this.#render();
        break;
      }
      case 'done': {
        if (this.#machine.canTransition('done')) this.#machine.transition('done');
        this.#resultInfo = { fileName: msg.fileName, sizeBytes: msg.sizeBytes };
        const blob = this.#runner.getResult();
        if (blob) {
          this.#resultBlobUrl = URL.createObjectURL(blob);
        }
        this.#unmountBeforeUnload();
        this.#render();
        break;
      }
      case 'cancelled': {
        if (this.#machine.canTransition('cancelled')) this.#machine.transition('cancelled');
        this.#error = new PatchError('CANCELLED');
        this.#unmountBeforeUnload();
        this.#render();
        break;
      }
      case 'error': {
        this.#fail(
          new PatchError(
            (msg.error.code as ErrorCode) ?? 'OUTPUT_MISMATCH',
            msg.error.technical,
          ),
        );
        break;
      }
    }
  }

  #fail(e: unknown): void {
    this.#error = e instanceof PatchError ? e : new PatchError('OUTPUT_MISMATCH', String(e));
    if (this.#machine.canTransition('failed')) this.#machine.transition('failed');
    this.#clearResult();
    this.#unmountBeforeUnload();
    this.#render();
  }

  #clearResult(): void {
    if (this.#resultBlobUrl) {
      URL.revokeObjectURL(this.#resultBlobUrl);
      this.#resultBlobUrl = null;
    }
    this.#resultInfo = null;
  }

  #mountBeforeUnload(): void {
    if (this.#beforeUnloadHandler) return;
    const win = this.#root instanceof Document ? this.#root.defaultView : (this.#root as HTMLElement).ownerDocument.defaultView;
    if (!win) return;
    this.#beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (!this.#machine.isBusy) return;
      e.preventDefault();
      e.returnValue = '';
    };
    win.addEventListener('beforeunload', this.#beforeUnloadHandler);
  }

  #unmountBeforeUnload(): void {
    if (!this.#beforeUnloadHandler) return;
    const win = this.#root instanceof Document ? this.#root.defaultView : (this.#root as HTMLElement).ownerDocument.defaultView;
    win?.removeEventListener('beforeunload', this.#beforeUnloadHandler);
    this.#beforeUnloadHandler = null;
  }

  get state(): string {
    return this.#machine.state;
  }

  renderHTML(): string {
    const state = this.#machine.state;
    if (this.#error && (state === 'failed' || state === 'cancelled')) {
      return this.#errorHTML(this.#error);
    }
    switch (state) {
      case 'idle':
        return this.#idleHTML();
      case 'hashing':
        return this.#progressHTML('Checking your file', 'Reading the file to confirm it is the right ROM.', 'Working');
      case 'verified':
        return this.#verifiedHTML();
      case 'fetching':
      case 'decrypting':
      case 'patching':
      case 'validating':
        return this.#progressHTML(
          'Building the English ROM',
          'Keep this tab open until it finishes.',
          'Working',
        );
      case 'done':
        return this.#doneHTML();
      default:
        return this.#idleHTML();
    }
  }

  #render(): void {
    const panel = this.#q<HTMLElement>('#patcher-panel');
    if (!panel) return;
    const current = panel.querySelector<HTMLElement>('[data-panel-body]');
    if (current) current.replaceWith(this.#bodyElement());
    else panel.appendChild(this.#bodyElement());
    this.#syncRequirements();
  }

  #bodyElement(): HTMLElement {
    const holder = document.createElement('div');
    holder.setAttribute('data-panel-body', '');
    holder.innerHTML = this.renderHTML();
    return holder;
  }

  #syncRequirements(): void {
    const line = this.#q<HTMLElement>('.req');
    const text = this.#q<HTMLElement>('#req-text');
    if (!line) return;
    const romBytes = this.#prepared?.expectedOutputBytes ?? 0;
    if (!romBytes) {
      line.hidden = true;
      return;
    }
    const mb = estimateMemoryMB(romBytes);
    const verdict = deviceLimitVerdict(this.#caps, romBytes);
    line.hidden = false;
    if (verdict === 'limited') {
      line.className = 'req warn';
      if (text) text.textContent = formatDeviceLimit(mb).message;
    } else {
      line.className = 'req';
      if (text) text.textContent = `Needs about ${mb} MB of free memory while patching.`;
    }
  }

  #head(title: string, sub: string, badge: string): string {
    return (
      '<div class="p-head"><div class="l">' +
      `<h2>${escapeHtml(title)}</h2>` +
      (sub ? `<p>${escapeHtml(sub)}</p>` : '') +
      '</div>' +
      badge +
      '</div>'
    );
  }

  #fileChip(sub: string, state: string, cls: string): string {
    const f = this.#file;
    return (
      '<div class="filechip' + (cls ? ' ' + cls : '') + '">' +
      '<div class="ico">NDS</div>' +
      '<div class="meta"><b>' + escapeHtml(f?.name ?? '') + '</b><span>' +
      escapeHtml(sub) +
      '</span></div>' +
      '<div class="state">' + escapeHtml(state) + '</div>' +
      '</div>'
    );
  }

  #stages(done: number, activeIdx: number): string {
    const names = STAGE_ORDER.map((p) => STAGE_SHORT[p]);
    return (
      '<div class="stages">' +
      names
        .map((n, i) => {
          const cls = i < done ? 'done' : i === activeIdx ? 'active' : '';
          return `<div class="${cls}">${n}</div>`;
        })
        .join('') +
      '</div>'
    );
  }

  #idleHTML(): string {
    return (
      this.#head(
        'Select your ROM',
        'A clean Japanese ROM. Everything happens on your device — nothing is uploaded.',
        '<span class="badge">Ready</span>',
      ) +
      '<div class="drop" id="drop-zone">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/>' +
      '<path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>' +
      '<b>Drop your ROM here</b>' +
      '<span>or choose it from your device</span>' +
      '<input class="rom-input" type="file" id="rom-input" accept=".nds,application/octet-stream" autocomplete="off">' +
      '<div class="pick">Choose file</div>' +
      '</div>' +
      '<div style="margin-top:22px">' + this.#reqWarn() + '</div>' +
      '<div class="actions">' +
      '<button class="btn" type="button" id="patch-btn" disabled aria-describedby="why1">Patch ROM</button>' +
      '<span class="hint" id="why1">Choose the right ROM first</span>' +
      '</div>'
    );
  }

  #reqWarn(text?: string): string {
    return (
      '<div class="req' + (text ? ' warn' : '') + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01"/>' +
      '<circle cx="12" cy="12" r="9"/></svg>' +
      (text ?? 'Needs about 96 MB of free memory while patching.') +
      '</div>'
    );
  }

  #verifiedHTML(): string {
    const mb = formatMB(this.#file?.size ?? 0);
    return (
      this.#head('ROM recognised', 'Ready to build the English version.', '<span class="badge ok">Verified</span>') +
      this.#fileChip(`${mb} MB · Japanese, clean`, '✓ Matched', 'ok') +
      this.#reqWarn() +
      '<div class="actions">' +
      '<button class="btn" type="button" data-action="patch">Patch ROM</button>' +
      '<button class="btn ghost small" type="button" data-action="choose-again">Choose another file</button>' +
      '</div>'
    );
  }

  #progressHTML(title: string, lede: string, badge: string): string {
    const pct = Math.round(this.#fraction * 100);
    const label = this.#phase ? PHASE_LABEL[this.#phase] : lede;
    const activeIdx = this.#phase ? STAGE_ORDER.indexOf(this.#phase) : 0;
    const done = this.#phase ? activeIdx : 0;

    return (
      this.#head(title, lede, `<span class="badge live">${badge}</span>`) +
      this.#fileChip(formatMB(this.#file?.size ?? 0) + ' MB', `${pct}%`, '') +
      '<div class="prog">' +
      `<div class="row"><span class="t">${escapeHtml(label)}</span><span class="n">${pct}%</span></div>` +
      `<div class="track"><i style="width:${pct}%"></i></div>` +
      this.#stages(done, activeIdx) +
      '</div>' +
      '<div class="actions">' +
      '<button class="btn" type="button" disabled>Patch ROM</button>' +
      '<button class="btn ghost small" type="button" data-action="cancel">Cancel</button>' +
      '</div>'
    );
  }

  #doneHTML(): string {
    const info = this.#resultInfo;
    const mb = formatMB(info?.sizeBytes ?? 0);
    return (
      this.#head('English ROM ready', '', '<span class="badge ok">Done</span>') +
      '<div class="done-hero">' +
      '<div class="tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg></div>' +
      '<h3>Download your ROM</h3>' +
      `<div class="fname">${escapeHtml(info?.fileName ?? '')} · ${mb} MB</div>` +
      '</div>' +
      '<div class="prog">' +
      '<div class="row"><span class="t">Finished. Your English ROM is ready to download.</span><span class="n">100%</span></div>' +
      '<div class="track"><i style="width:100%"></i></div>' +
      this.#stages(STAGE_DONE, -1) +
      '</div>' +
      '<div class="actions">' +
      '<button class="btn" type="button" data-action="download">Download ROM</button>' +
      '<button class="btn ghost small" type="button" data-action="rebuild">Rebuild</button>' +
      '</div>' +
      '<div class="done-note">This file already contains the translation. Keep it somewhere safe — ' +
      'if you lose it, your original ROM can always be patched again.</div>'
    );
  }

  #errorHTML(err: PatchError): string {
    const tech = err.technical
      ? '<details><summary>Technical details</summary><pre>' +
        escapeHtml(`code: ${err.code}\n${err.technical}`) +
        '</pre></details>'
      : '';
    return (
      this.#head(err.title, '', '<span class="badge err">Stopped</span>') +
      this.#fileChip(formatMB(this.#file?.size ?? 0) + ' MB', err.code.replace(/_/g, ' ').toLowerCase(), 'err') +
      '<div class="err-box">' +
      '<div class="h"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>' +
      '<path d="M12 8v5M12 16.5h.01"/></svg><b>' + escapeHtml(err.title) + '</b></div>' +
      `<div class="msg">${escapeHtml(err.message)}</div>` +
      '<div class="next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"/></svg>' +
      `<span>${escapeHtml(err.nextStep)}</span></div>` +
      tech +
      '</div>' +
      '<div class="actions">' +
      '<button class="btn ghost small" type="button" data-action="choose-again">Choose another file</button>' +
      '</div>'
    );
  }
}
