import { parseBps, type ParsedBps } from '../lib/bps/parser.ts';
import { applyBps } from '../lib/bps/applier.ts';
import { BlobReader, type RandomReader } from '../lib/bps/reader.ts';
import { hashChunks } from '../lib/hash.ts';
import { deriveKey } from '../lib/crypto/derive-key.ts';
import { decryptChunk, ChunkIntegrityError } from '../lib/crypto/chunk-decryptor.ts';
import { chunkAt, type Manifest } from '../lib/manifest.ts';
import { verifyOutput, OutputVerifyError, type VerifyReport } from '../lib/verify-output.ts';
import { selectSink, type SinkSelection } from '../lib/sink/opfs-sink.ts';
import { PatchError, toPatchError } from '../lib/errors.ts';
import type { ProgressPhase } from '../workers/protocol.ts';
import { toBlob } from '../lib/blob.ts';

export interface PipelineInput {
  rom: Blob;
  manifest: Manifest;
  fetchChunk: (name: string) => Promise<Uint8Array>;
  onProgress?: (phase: ProgressPhase, fraction: number) => void;
  shouldCancel?: () => boolean;
}

export interface PipelineResult {
  blob: Blob;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  verify: VerifyReport;
}

export interface PreparedInfo {
  romSha256: string;
  romSizeBytes: number;
  expectedOutputBytes: number;
  outputFileName: string;
}

export async function prepareRom(
  rom: Blob,
  manifest: Manifest,
  options: {
    onProgress?: (fraction: number) => void;
    shouldCancel?: () => boolean;
  } = {},
): Promise<PreparedInfo> {
  if (rom.size === 0) {
    throw new PatchError('NOT_ROM', `file kosong (${rom.size} byte)`);
  }
  if (rom.size !== manifest.source.sizeBytes) {
    const truncated = rom.size < manifest.source.sizeBytes;
    throw new PatchError(
      truncated ? 'TRUNCATED' : 'WRONG_VARIANT',
      `ukuran ${rom.size}, manifest mengharapkan ${manifest.source.sizeBytes}`,
    );
  }

  const reader = new BlobReader(rom);
  const romSha256 = await hashChunks(reader, {
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.shouldCancel ? { shouldCancel: options.shouldCancel } : {}),
  });

  if (romSha256 === manifest.target.sha256) {
    throw new PatchError('ALREADY_PATCHED', 'hash cocok dengan hasil patch, bukan ROM asli');
  }
  if (romSha256 !== manifest.source.sha256) {
    throw new PatchError(
      'WRONG_VARIANT',
      `hash ${romSha256} ≠ source.sha256 ${manifest.source.sha256}`,
    );
  }

  return {
    romSha256,
    romSizeBytes: rom.size,
    expectedOutputBytes: manifest.target.sizeBytes,
    outputFileName: manifest.target.fileName,
  };
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { rom, manifest, fetchChunk, onProgress, shouldCancel } = input;

  const report = (phase: ProgressPhase, fraction: number): void => {
    onProgress?.(phase, Math.max(0, Math.min(1, fraction)));
  };

  const checkCancel = (): void => {
    if (shouldCancel?.()) throw new PatchError('CANCELLED');
  };

  const prepared = await prepareRom(rom, manifest, {
    ...(onProgress ? { onProgress: (f) => report('hashing', f) } : {}),
    ...(shouldCancel ? { shouldCancel } : {}),
  });
  checkCancel();

  const key = await deriveKey({
    romSha256Hex: prepared.romSha256,
    salt: manifest.encryption.salt,
  });

  const ctx = {
    patchVersion: manifest.patchVersion,
    chunkCount: manifest.encryption.chunkCount,
    ivPrefix: manifest.encryption.ivPrefix,
  };

  const totalPatchBytes = manifest.compression.patchBytes;
  const cipherChunks: Uint8Array[] = [];
  let fetchedBytes = 0;
  const totalCipherBytes = manifest.encryption.chunkCount * 16 + totalPatchBytes;

  for (let index = 0; index < manifest.encryption.chunkCount; index++) {
    checkCancel();
    const entry = chunkAt(manifest, index);

    let cipher: Uint8Array;
    try {
      cipher = await fetchChunk(entry.name);
    } catch (e) {
      throw new PatchError(
        'NETWORK_FAILED',
        `potongan ${entry.name} gagal diambil: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (cipher.length !== entry.bytes) {
      throw new PatchError(
        'CHUNK_INTEGRITY_FAILED',
        `potongan ${index} berukuran ${cipher.length}, manifest menyebut ${entry.bytes}`,
      );
    }
    cipherChunks.push(cipher);
    fetchedBytes += cipher.length;
    report('fetching', fetchedBytes / totalCipherBytes);
  }

  const patchChunks: Uint8Array[] = [];
  let decryptedBytes = 0;

  for (let index = 0; index < cipherChunks.length; index++) {
    checkCancel();
    let plain: Uint8Array;
    try {
      plain = await decryptChunk(key, cipherChunks[index]!, index, ctx);
    } catch (e) {
      if (e instanceof ChunkIntegrityError) {
        throw new PatchError('CHUNK_INTEGRITY_FAILED', e.message);
      }
      throw e;
    }
    patchChunks.push(plain);
    decryptedBytes += plain.length;
    report('decrypting', decryptedBytes / totalPatchBytes);
  }

  const patchBytes = new Uint8Array(totalPatchBytes);
  {
    let o = 0;
    for (const c of patchChunks) {
      patchBytes.set(c, o);
      o += c.length;
    }
    if (o !== totalPatchBytes) {
      throw new PatchError(
        'CHUNK_INTEGRITY_FAILED',
        `paket hasil rekonstruksi ${o} byte, manifest menyebut ${totalPatchBytes}`,
      );
    }
  }

  const patchReader = new BlobReader(toBlob(patchBytes));
  let parsed: ParsedBps;
  try {
    parsed = await parseBps(patchReader);
  } catch (e) {
    throw new PatchError(
      'CHUNK_INTEGRITY_FAILED',
      `paket patch tidak bisa dibaca: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (parsed.header.sourceSize !== rom.size) {
    throw new PatchError(
      'WRONG_VARIANT',
      `patch dibuat untuk ROM ${parsed.header.sourceSize} byte, file ini ${rom.size}`,
    );
  }

  let selection: SinkSelection;
  try {
    selection = await selectSink(manifest.target.sizeBytes);
  } catch (e) {
    throw toPatchError(e);
  }

  try {
    await applyBps(parsed, new BlobReader(rom), patchReader, selection.sink, {
      ...(onProgress ? { onProgress: (f) => report('patching', f) } : {}),
      ...(shouldCancel ? { shouldCancel } : {}),
    });
    checkCancel();

    report('validating', 0);
    const resultBlob = await selection.sink.finish();
    let verify: VerifyReport;
    try {
      verify = await verifyOutput({
        result: resultBlob,
        footer: parsed.footer,
        patchBytes,
        manifest,
      });
    } catch (e) {
      if (e instanceof OutputVerifyError) throw new PatchError('OUTPUT_MISMATCH', e.message);
      throw e;
    }
    if (!verify.ok) {
      throw new PatchError(
        'OUTPUT_MISMATCH',
        verify.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.actual}`).join(' | '),
      );
    }
    report('validating', 1);

    return {
      blob: resultBlob,
      fileName: manifest.target.fileName,
      sizeBytes: resultBlob.size,
      sha256: manifest.target.sha256,
      verify,
    };
  } catch (e) {
    await selection.sink.dispose().catch(() => {});
    throw e instanceof PatchError ? e : toPatchError(e);
  }
}
