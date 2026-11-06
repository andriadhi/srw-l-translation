export interface Sink {
  readonly size: number;
  write(offset: number, data: Uint8Array): Promise<void>;
  read(offset: number, length: number): Promise<Uint8Array>;
  finish(): Promise<Blob>;
  dispose(): Promise<void>;
}

export class MemorySink implements Sink {
  #buf: Uint8Array;
  #disposed = false;

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 0) {
      throw new RangeError(`ukuran sink harus bilangan bulat >= 0 (dapat: ${size})`);
    }
    this.#buf = new Uint8Array(size);
  }

  get size(): number {
    return this.#buf.length;
  }

  #assertAlive(): void {
    if (this.#disposed) throw new Error('sink sudah dibuang');
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    this.#assertAlive();
    if (offset < 0 || offset + data.length > this.#buf.length) {
      throw new RangeError(
        `tulis di luar batas sink: ${offset}+${data.length} > ${this.#buf.length}`,
      );
    }
    this.#buf.set(data, offset);
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    this.#assertAlive();
    if (offset < 0 || offset + length > this.#buf.length) {
      throw new RangeError(
        `baca di luar batas sink: ${offset}+${length} > ${this.#buf.length}`,
      );
    }
    return this.#buf.slice(offset, offset + length);
  }

  async finish(): Promise<Blob> {
    this.#assertAlive();
    return new Blob([this.#buf.buffer as ArrayBuffer]);
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#buf = new Uint8Array(0);
  }
}
