import type { WorkerRequest, WorkerResponse, JobId } from './protocol.ts';
import { PatchStateMachine, IllegalTransition } from './state-machine.ts';
import { prepareRom, runPipeline, type PreparedInfo } from '../lib/pipeline.ts';
import { loadManifest, type Manifest } from '../lib/manifest.ts';
import { PatchError, toPatchError } from '../lib/errors.ts';

interface Job {
  id: JobId;
  rom: Blob;
  manifest: Manifest | null;
  prepared: PreparedInfo | null;
  machine: PatchStateMachine;
  cancelled: boolean;
  manifestUrl: string;
}

export interface WorkerPort {
  postMessage(msg: WorkerResponse): void;
}

export class PatcherWorkerCore {
  #port: WorkerPort;
  #job: Job | null = null;

  constructor(port: WorkerPort) {
    this.#port = port;
  }

  get currentJob(): Job | null {
    return this.#job;
  }

  async handle(msg: WorkerRequest): Promise<void> {
    try {
      switch (msg.type) {
        case 'prepare':
          await this.#prepare(msg.jobId, msg.rom, msg.manifestUrl);
          break;
        case 'start':
          await this.#start(msg.jobId);
          break;
        case 'cancel':
          this.#cancel(msg.jobId);
          break;
        case 'dispose':
          await this.#dispose(msg.jobId);
          break;
        default: {
          const unknown = msg as { type?: string };
          this.#post({
            type: 'error',
            jobId: (msg as { jobId?: string }).jobId ?? 'unknown',
            error: new PatchError('OUTPUT_MISMATCH', `pesan tidak dikenal: ${unknown.type}`).toJSON(),
          });
        }
      }
    } catch (e) {
      const err = e instanceof PatchError ? e : toPatchError(e);
      const jobId = (msg as { jobId?: string }).jobId ?? 'unknown';
      this.#post({ type: 'error', jobId, error: err.toJSON() });
    }
  }

  #post(msg: WorkerResponse): void {
    this.#port.postMessage(msg);
  }

  async #prepare(jobId: JobId, rom: File | Blob, manifestUrl: string): Promise<void> {
    const machine = new PatchStateMachine();
    machine.transition('hashing');
    this.#job = {
      id: jobId,
      rom,
      manifest: null,
      prepared: null,
      machine,
      cancelled: false,
      manifestUrl,
    };

    const manifest = await loadManifest(manifestUrl).catch((e) => {
      throw e instanceof PatchError ? e : new PatchError('NETWORK_FAILED', String(e));
    });

    const prepared = await prepareRom(rom, manifest, {
      onProgress: (f) => this.#post({ type: 'progress', jobId, phase: 'hashing', fraction: f }),
      shouldCancel: () => this.#job?.cancelled ?? false,
    });

    this.#job.manifest = manifest;
    this.#job.prepared = prepared;
    machine.transition('verified');

    this.#post({
      type: 'prepared',
      jobId,
      romSha256: prepared.romSha256,
      romSizeBytes: prepared.romSizeBytes,
      expectedOutputBytes: prepared.expectedOutputBytes,
      outputFileName: prepared.outputFileName,
    });
  }

  async #start(jobId: JobId): Promise<void> {
    const job = this.#job;
    if (!job || job.id !== jobId) {
      throw new PatchError('CANCELLED', `job ${jobId} tidak aktif`);
    }
    try {
      job.machine.assertCanPatch();
    } catch (e) {
      if (e instanceof IllegalTransition) {
        throw new PatchError('WRONG_VARIANT', `tidak bisa mulai dari state ${job.machine.state}`);
      }
      throw e;
    }
    if (!job.manifest || !job.prepared) {
      throw new PatchError('MANIFEST_UNSUPPORTED', 'manifest belum siap');
    }

    job.machine.transition('fetching');
    const manifest = job.manifest;

    const fetchChunk = async (name: string): Promise<Uint8Array> => {
      const base = new URL(manifestUrlDir(job.manifestUrl), globalThis.location?.href ?? 'http://localhost/');
      const url = new URL(name, base);
      const res = await fetch(url.toString(), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${name}`);
      return new Uint8Array(await res.arrayBuffer());
    };

    const result = await runPipeline({
      rom: job.rom,
      manifest,
      fetchChunk,
      onProgress: (phase, fraction) => {
        const map: Record<string, Parameters<PatchStateMachine['transition']>[0]> = {
          fetching: 'fetching',
          decrypting: 'decrypting',
          patching: 'patching',
          validating: 'validating',
        };
        const target = map[phase];
        if (target && job.machine.canTransition(target)) {
          job.machine.transition(target);
        }
        this.#post({ type: 'progress', jobId, phase, fraction });
      },
      shouldCancel: () => job.cancelled,
    });

    if (job.machine.canTransition('done')) job.machine.transition('done');

    this.#post({
      type: 'done',
      jobId,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
      blob: result.blob,
    });
  }

  #cancel(jobId: JobId): void {
    const job = this.#job;
    if (!job || job.id !== jobId) return;
    job.cancelled = true;
    if (job.machine.canTransition('cancelled')) {
      job.machine.transition('cancelled');
    }
    this.#post({ type: 'cancelled', jobId });
  }

  async #dispose(jobId: JobId): Promise<void> {
    if (this.#job?.id === jobId) {
      this.#job = null;
    }
  }
}

export function manifestUrlDir(manifestUrl: string): string {
  const idx = manifestUrl.lastIndexOf('/');
  return idx >= 0 ? manifestUrl.slice(0, idx + 1) : './';
}
