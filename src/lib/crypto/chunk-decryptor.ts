import { KEY_INFO } from './derive-key.ts';

export class ChunkIntegrityError extends Error {
  readonly code = 'CHUNK_INTEGRITY_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'ChunkIntegrityError';
  }
}

export function buildIv(ivPrefix: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  if (ivPrefix.length !== 8) {
    throw new RangeError(`ivPrefix harus 8 byte (dapat: ${ivPrefix.length})`);
  }
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
    throw new RangeError(`index potongan tidak sah: ${index}`);
  }
  const iv = new Uint8Array(12);
  iv.set(ivPrefix, 0);
  new DataView(iv.buffer).setUint32(8, index, false);
  return iv;
}

export function buildAad(
  patchVersion: string,
  index: number,
  chunkCount: number,
): Uint8Array<ArrayBuffer> {
  const versionBytes = new TextEncoder().encode(patchVersion);
  const infoBytes = new TextEncoder().encode(KEY_INFO);
  const aad = new Uint8Array(infoBytes.length + versionBytes.length + 4 + 4);
  let o = 0;
  aad.set(infoBytes, o);
  o += infoBytes.length;
  aad.set(versionBytes, o);
  o += versionBytes.length;
  const dv = new DataView(aad.buffer);
  dv.setUint32(o, index, false);
  o += 4;
  dv.setUint32(o, chunkCount, false);
  return aad;
}

export interface ChunkContext {
  patchVersion: string;
  chunkCount: number;
  ivPrefix: Uint8Array;
}

export async function decryptChunk(
  key: CryptoKey,
  ciphertext: Uint8Array,
  index: number,
  ctx: ChunkContext,
  cryptoImpl: Crypto = globalThis.crypto,
): Promise<Uint8Array> {
  if (ciphertext.length < 16) {
    throw new ChunkIntegrityError(
      `potongan ${index} terlalu pendek (${ciphertext.length} byte, minimum 16)`,
    );
  }
  if (index >= ctx.chunkCount) {
    throw new ChunkIntegrityError(
      `index potongan ${index} di luar jumlah potongan ${ctx.chunkCount}`,
    );
  }

  try {
    const data = new Uint8Array(ciphertext.length);
    data.set(ciphertext);
    const plain = await cryptoImpl.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: buildIv(ctx.ivPrefix, index),
        additionalData: buildAad(ctx.patchVersion, index, ctx.chunkCount),
        tagLength: 128,
      },
      key,
      data.buffer,
    );
    return new Uint8Array(plain);
  } catch {
    throw new ChunkIntegrityError(
      `potongan ${index} gagal diverifikasi — data rusak atau dari rilis lain`,
    );
  }
}

export function expectedPlainLength(
  index: number,
  chunkSize: number,
  patchBytes: number,
): number {
  const start = index * chunkSize;
  return Math.max(0, Math.min(chunkSize, patchBytes - start));
}
