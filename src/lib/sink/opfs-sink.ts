import { MemorySink, type Sink } from './memory-sink.ts';

const WRITE_CHUNK = 1024 * 1024;

export class OpfsSink implements Sink {
  #handle: FileSystemFileHandle;
  #access: FileSystemSyncAccessHandle;
  #size: number;
  #disposed = false;

  private constructor(
    handle: FileSystemFileHandle,
    access: FileSystemSyncAccessHandle,
    size: number,
  ) {
    this.#handle = handle;
    this.#access = access;
    this.#size = size;
  }

  static isAvailable(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.storage?.getDirectory === 'function' &&
      typeof FileSystemFileHandle !== 'undefined' &&
      typeof (FileSystemFileHandle.prototype as { createSyncAccessHandle?: unknown })
        .createSyncAccessHandle === 'function'
    );
  }

  static async create(fileName: string, size: number): Promise<OpfsSink> {
    if (!OpfsSink.isAvailable()) {
      throw new Error('OPFS dengan createSyncAccessHandle tidak tersedia');
    }
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(fileName, { create: true });
    const access = await handle.createSyncAccessHandle();
    access.truncate(size);
    return new OpfsSink(handle, access, size);
  }

  get size(): number {
    return this.#size;
  }

  #assertAlive(): void {
    if (this.#disposed) throw new Error('sink sudah dibuang');
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    this.#assertAlive();
    if (offset < 0 || offset + data.length > this.#size) {
      throw new RangeError(
        `tulis di luar batas sink: ${offset}+${data.length} > ${this.#size}`,
      );
    }
    let written = 0;
    while (written < data.length) {
      const n = Math.min(WRITE_CHUNK, data.length - written);
      const slice = data.subarray(written, written + n);
      const copy = new Uint8Array(n);
      copy.set(slice);
      this.#access.write(copy, { at: offset + written });
      written += n;
    }
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    this.#assertAlive();
    if (offset < 0 || offset + length > this.#size) {
      throw new RangeError(
        `baca di luar batas sink: ${offset}+${length} > ${this.#size}`,
      );
    }
    const buf = new Uint8Array(length);
    this.#access.read(buf, { at: offset });
    return buf;
  }

  async finish(): Promise<Blob> {
    this.#assertAlive();
    this.#access.flush();
    return this.#handle.getFile();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#access.close();
    } catch {
    }
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.#handle.name);
    } catch {
    }
  }
}

export type SinkKind = 'opfs' | 'memory';

export interface SinkSelection {
  sink: Sink;
  kind: SinkKind;
  fileName: string | null;
}

export class NoSinkAvailable extends Error {
  readonly code = 'STORAGE_FULL';
  constructor(message: string) {
    super(message);
    this.name = 'NoSinkAvailable';
  }
}

export async function selectSink(
  size: number,
  fileName = 'srwl-output.tmp',
): Promise<SinkSelection> {
  if (OpfsSink.isAvailable()) {
    try {
      const sink = await OpfsSink.create(fileName, size);
      return { sink, kind: 'opfs', fileName };
    } catch {
    }
  }
  try {
    const sink = new MemorySink(size);
    return { sink, kind: 'memory', fileName: null };
  } catch (e) {
    throw new NoSinkAvailable(
      `tidak ada penyimpanan yang cukup untuk ${Math.ceil(size / (1024 * 1024))} MB: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}
