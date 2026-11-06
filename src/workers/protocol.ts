export type JobId = string;

export type WorkerRequest =
  | {
      type: 'prepare';
      jobId: JobId;
      rom: File;
      manifestUrl: string;
    }
  | { type: 'start'; jobId: JobId }
  | { type: 'cancel'; jobId: JobId }
  | { type: 'dispose'; jobId: JobId };

export type WorkerResponse =
  | {
      type: 'prepared';
      jobId: JobId;
      romSha256: string;
      romSizeBytes: number;
      expectedOutputBytes: number;
      outputFileName: string;
    }
  | { type: 'progress'; jobId: JobId; phase: ProgressPhase; fraction: number }
  | { type: 'done'; jobId: JobId; fileName: string; sizeBytes: number; sha256: string; blob: Blob }
  | { type: 'error'; jobId: JobId; error: SerializedError }
  | { type: 'cancelled'; jobId: JobId };

export type ProgressPhase =
  | 'hashing'
  | 'fetching'
  | 'decrypting'
  | 'patching'
  | 'validating';

export interface SerializedError {
  code: string;
  title: string;
  message: string;
  nextStep: string;
  technical: string | null;
}

export function newJobId(): JobId {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
