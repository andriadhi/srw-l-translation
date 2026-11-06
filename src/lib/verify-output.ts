import { Crc32, crc32 } from './bps/crc32.ts';
import { sha256Hex } from './hash.ts';
import type { BpsFooter } from './bps/parser.ts';
import type { Manifest } from './manifest.ts';

export interface VerifyInput {
  result: Blob;
  footer: BpsFooter;
  patchBytes: Uint8Array;
  manifest: Manifest;
}

export interface VerifyCheck {
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
}

export interface VerifyReport {
  ok: boolean;
  checks: VerifyCheck[];
}

export class OutputVerifyError extends Error {
  readonly code = 'OUTPUT_MISMATCH';
  readonly report: VerifyReport;
  constructor(report: VerifyReport) {
    super(
      'hasil patch tidak lolos verifikasi: ' +
        report.checks.filter((c) => !c.ok).map((c) => c.name).join(', '),
    );
    this.name = 'OutputVerifyError';
    this.report = report;
  }
}

export async function crc32OfBlob(blob: Blob, chunk = 1024 * 1024): Promise<number> {
  const hasher = new Crc32();
  for (let off = 0; off < blob.size; off += chunk) {
    const slice = blob.slice(off, Math.min(off + chunk, blob.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return hasher.value;
}

export async function sha256OfBlob(blob: Blob, chunk = 2 * 1024 * 1024): Promise<string> {
  const { createSHA256 } = await import('hash-wasm');
  const hasher = await createSHA256();
  hasher.init();
  for (let off = 0; off < blob.size; off += chunk) {
    const slice = blob.slice(off, Math.min(off + chunk, blob.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return hasher.digest('hex');
}

function hex32(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}

export async function verifyOutput(input: VerifyInput): Promise<VerifyReport> {
  const { result, footer, patchBytes, manifest } = input;
  const checks: VerifyCheck[] = [];

  const resultCrc = await crc32OfBlob(result);
  checks.push({
    name: 'CRC32 hasil = CRC32 target di footer',
    ok: resultCrc === footer.targetChecksum,
    expected: hex32(footer.targetChecksum),
    actual: hex32(resultCrc),
  });

  const patchPrefix =
    patchBytes.length >= 4 ? patchBytes.subarray(0, patchBytes.length - 4) : patchBytes;
  const patchCrc = crc32(patchPrefix);
  checks.push({
    name: 'CRC32 paket patch = CRC32 patch di footer',
    ok: patchCrc === footer.patchChecksum,
    expected: hex32(footer.patchChecksum),
    actual: hex32(patchCrc),
  });

  const resultSha = await sha256OfBlob(result);
  checks.push({
    name: 'SHA-256 hasil = manifest.target.sha256',
    ok: resultSha === manifest.target.sha256,
    expected: manifest.target.sha256,
    actual: resultSha,
  });

  checks.push({
    name: 'ukuran hasil = manifest.target.sizeBytes',
    ok: result.size === manifest.target.sizeBytes,
    expected: String(manifest.target.sizeBytes),
    actual: String(result.size),
  });

  return { ok: checks.every((c) => c.ok), checks };
}

export async function assertOutputVerified(input: VerifyInput): Promise<VerifyReport> {
  const report = await verifyOutput(input);
  if (!report.ok) throw new OutputVerifyError(report);
  return report;
}
