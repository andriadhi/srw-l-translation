import './styles/tokens.css';
import './styles/base.css';
import './styles/hero.css';
import './styles/footer.css';
import './styles/patcher.css';
import './styles/patch-page.css';
import './styles/final.css';

import { detectCapabilities, canProcess } from './lib/capabilities.ts';
import { PatcherPanel } from './patcher/panel.ts';
import { WorkerRunner } from './workers/worker-runner.ts';
import { initStars } from './sections/stars.ts';

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/';
const MANIFEST_URL = new URL('p/manifest.json', new URL(BASE, location.href)).toString();

const NO_BUILD_HTML = `
  <div class="err-box">
    <div class="h"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>
      <path d="M12 8v5M12 16.5h.01"/></svg>
      <b>No build to patch yet</b></div>
    <div class="msg">The first translation build hasn't been published, so there is nothing to
      apply to your ROM right now. The translation work is still in progress — the progress
      table on the project page shows where it stands.</div>
    <div class="next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"/></svg>
      <span>Check the project page for progress, or come back when a build is released.</span></div>
  </div>`;

async function boot(): Promise<void> {
  document.documentElement.dataset['js'] = 'on';

  const starCanvas = document.getElementById('stars');
  if (starCanvas instanceof HTMLCanvasElement) initStars(starCanvas);

  const panel = document.getElementById('patcher-panel');
  if (!panel) return;

  let buildAvailable = false;
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (res.ok) {
      const body = await res.text();
      try {
        const parsed: unknown = JSON.parse(body);
        buildAvailable =
          typeof parsed === 'object' && parsed !== null && 'patchVersion' in parsed;
      } catch {
        buildAvailable = false;
      }
    }
  } catch {
    buildAvailable = false;
  }

  if (!buildAvailable) {
    panel.innerHTML = NO_BUILD_HTML;
    panel.classList.add('is-unavailable');
    return;
  }

  const caps = await detectCapabilities();

  if (!canProcess(caps)) {
    panel.innerHTML = `
      <div class="err-box">
        <div class="h"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>
          <path d="M12 8v5M12 16.5h.01"/></svg>
          <b>This browser cannot run the patcher</b></div>
        <div class="msg">The patcher needs Web Workers and WebAssembly. This browser reports that it
          supports neither, so the ROM cannot be built here.</div>
        <div class="next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"/></svg>
          <span>Try a current version of Chrome, Firefox, Edge or Safari.</span></div>
      </div>`;
    return;
  }

  const runner = new WorkerRunner();

  const patches = new PatcherPanel({
    root: document,
    runner,
    manifestUrl: MANIFEST_URL,
    capabilities: caps,
  });

  (window as unknown as { __patcher?: PatcherPanel }).__patcher = patches;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}
