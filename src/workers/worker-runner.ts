import type { PatcherRunner } from '../patcher/panel.ts';
import type { JobId, WorkerRequest, WorkerResponse } from './protocol.ts';

export class WorkerRunner implements PatcherRunner {
  #worker: Worker;
  #handlers: Array<(msg: WorkerResponse) => void> = [];
  #result: Blob | null = null;

  constructor() {
    this.#worker = new Worker(new URL('./worker-entry.ts', import.meta.url), {
      type: 'module',
    });
    this.#worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'done') this.#result = msg.blob;
      for (const h of this.#handlers) h(msg);
    });
  }

  onMessage(handler: (msg: WorkerResponse) => void): void {
    this.#handlers.push(handler);
  }

  #send(msg: WorkerRequest): void {
    this.#worker.postMessage(msg);
  }

  async prepare(jobId: JobId, rom: File, manifestUrl: string): Promise<void> {
    this.#send({ type: 'prepare', jobId, rom, manifestUrl });
  }

  async start(jobId: JobId): Promise<void> {
    this.#send({ type: 'start', jobId });
  }

  cancel(jobId: JobId): void {
    this.#send({ type: 'cancel', jobId });
  }

  getResult(): Blob | null {
    return this.#result;
  }

  dispose(): void {
    this.#worker.terminate();
    this.#result = null;
    this.#handlers = [];
  }
}
