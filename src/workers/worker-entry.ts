import { PatcherWorkerCore } from './patcher.worker.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

const core = new PatcherWorkerCore({
  postMessage(msg: WorkerResponse): void {
    self.postMessage(msg);
  },
});

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void core.handle(event.data);
});

export {};
