import { createSHA256 } from 'hash-wasm';

export const DEFAULT_CHUNK = 2 * 1024 * 1024;

export interface HashableSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export async function hashChunks(
  source: HashableSource,
  options: {
    chunkSize?: number;
    onProgress?: (fraction: number) => void;
    shouldCancel?: () => boolean;
  } = {},
): Promise<string> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError(`chunkSize harus bilangan bulat > 0 (dapat: ${chunkSize})`);
  }

  const hasher = await createSHA256();
  hasher.init();

  let offset = 0;
  while (offset < source.size) {
    if (options.shouldCancel?.()) {
      throw new Error('hashing dibatalkan');
    }
    const length = Math.min(chunkSize, source.size - offset);
    const chunk = await source.read(offset, length);
    hasher.update(chunk);
    offset += length;
    options.onProgress?.(source.size === 0 ? 1 : offset / source.size);
  }

  return hasher.digest('hex');
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  hasher.update(data);
  return hasher.digest('hex');
}
