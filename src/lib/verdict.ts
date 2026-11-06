import type { ErrorCode } from './errors.ts';

export type Verdict =
  | 'valid'
  | 'not_rom'
  | 'wrong_game'
  | 'wrong_variant'
  | 'truncated'
  | 'already_patched';

export const NDS_HEADER = {
  titleOffset: 0x00,
  titleLength: 12,
  gameCodeOffset: 0x0c,
  gameCodeLength: 4,
  makerCodeOffset: 0x10,
  makerCodeLength: 2,
  headerSize: 0x200,
} as const;

export const EXPECTED_GAME_CODE = 'BRWJ';

export interface VerdictInput {
  header: Uint8Array;
  sizeBytes: number;
  sha256: string | null;
  expected: {
    sourceSha256: string;
    sourceSizeBytes: number;
    targetSha256: string;
    gameCode?: string;
  };
}

export interface VerdictResult {
  verdict: Verdict;
  errorCode: ErrorCode | null;
  technical: string | null;
  header: {
    title: string | null;
    gameCode: string | null;
    makerCode: string | null;
  };
}

function readAscii(buf: Uint8Array, offset: number, length: number): string | null {
  if (buf.length < offset + length) return null;
  let out = '';
  for (let i = 0; i < length; i++) {
    const b = buf[offset + i]!;
    if (b === 0) break;
    if (b < 0x20 || b > 0x7e) return out.length > 0 ? out : null;
    out += String.fromCharCode(b);
  }
  return out.trim() || null;
}

export function looksLikeNdsRom(header: Uint8Array, sizeBytes: number): boolean {
  if (sizeBytes < NDS_HEADER.headerSize) return false;
  if (header.length < NDS_HEADER.headerSize) return false;

  const code = readAscii(header, NDS_HEADER.gameCodeOffset, NDS_HEADER.gameCodeLength);
  const maker = readAscii(header, NDS_HEADER.makerCodeOffset, NDS_HEADER.makerCodeLength);
  if (!code || code.length !== 4) return false;
  if (!/^[A-Z0-9]{4}$/.test(code)) return false;
  if (!maker || maker.length !== 2) return false;
  if (!/^[A-Z0-9]{2}$/.test(maker)) return false;

  const unit = header[0x12];
  if (unit !== undefined && ![0x00, 0x02, 0x03].includes(unit)) return false;

  return true;
}

export function classify(input: VerdictInput): VerdictResult {
  const { header, sizeBytes, sha256, expected } = input;

  const parsedHeader = {
    title: readAscii(header, NDS_HEADER.titleOffset, NDS_HEADER.titleLength),
    gameCode: readAscii(header, NDS_HEADER.gameCodeOffset, NDS_HEADER.gameCodeLength),
    makerCode: readAscii(header, NDS_HEADER.makerCodeOffset, NDS_HEADER.makerCodeLength),
  };

  const result = (verdict: Verdict, errorCode: ErrorCode | null, technical: string | null): VerdictResult => ({
    verdict,
    errorCode,
    technical,
    header: parsedHeader,
  });

  if (sizeBytes === 0) {
    return result('not_rom', 'NOT_ROM', 'file berukuran 0 byte');
  }

  if (sha256 !== null && sha256 === expected.targetSha256) {
    return result(
      'already_patched',
      'ALREADY_PATCHED',
      'hash file sama dengan manifest.target.sha256',
    );
  }

  if (!looksLikeNdsRom(header, sizeBytes)) {
    return result(
      'not_rom',
      'NOT_ROM',
      `header bukan NDS: ukuran ${sizeBytes}, game code ${JSON.stringify(parsedHeader.gameCode)}`,
    );
  }

  const wantCode = expected.gameCode ?? EXPECTED_GAME_CODE;
  if (parsedHeader.gameCode !== wantCode) {
    return result(
      'wrong_game',
      'WRONG_GAME',
      `game code ${parsedHeader.gameCode}, diharapkan ${wantCode}` +
        (parsedHeader.title ? ` (judul di header: ${parsedHeader.title})` : ''),
    );
  }

  if (sizeBytes < expected.sourceSizeBytes) {
    return result(
      'truncated',
      'TRUNCATED',
      `ukuran ${sizeBytes} < ${expected.sourceSizeBytes} (kurang ${
        expected.sourceSizeBytes - sizeBytes
      } byte)`,
    );
  }

  if (sizeBytes > expected.sourceSizeBytes) {
    return result(
      'wrong_variant',
      'WRONG_VARIANT',
      `ukuran ${sizeBytes} > ${expected.sourceSizeBytes} — ada data tambahan di akhir`,
    );
  }

  if (sha256 === null) {
    throw new Error('classify: ukuran cocok tetapi sha256 belum dihitung');
  }
  if (sha256 !== expected.sourceSha256) {
    return result(
      'wrong_variant',
      'WRONG_VARIANT',
      `ukuran cocok, hash ${sha256.slice(0, 16)}… ≠ ${expected.sourceSha256.slice(0, 16)}…`,
    );
  }

  return result('valid', null, null);
}

export function isPatchable(verdict: Verdict): boolean {
  return verdict === 'valid';
}
