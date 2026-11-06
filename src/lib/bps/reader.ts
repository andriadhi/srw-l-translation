export const MAX_READ = 4 * 1024 * 1024;

export interface RandomReader {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export class BlobReader implements RandomReader {
  #blob: Blob;

  constructor(blob: Blob) {
    this.#blob = blob;
  }

  get size(): number {
    return this.#blob.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError(`offset harus bilangan bulat >= 0 (dapat: ${offset})`);
    }
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`length harus bilangan bulat >= 0 (dapat: ${length})`);
    }
    if (offset + length > this.#blob.size) {
      throw new RangeError(
        `baca melewati akhir file: ${offset}+${length} > ${this.#blob.size}`,
      );
    }
    if (length === 0) return new Uint8Array(0);
    if (length > MAX_READ) {
      throw new RangeError(`read ${length} byte melebihi MAX_READ ${MAX_READ}`);
    }
    const buf = await this.#blob.slice(offset, offset + length).arrayBuffer();
    return new Uint8Array(buf);
  }
}
