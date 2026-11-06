export type ErrorCode =
  | 'NOT_ROM'
  | 'WRONG_GAME'
  | 'WRONG_VARIANT'
  | 'TRUNCATED'
  | 'ALREADY_PATCHED'
  | 'MANIFEST_UNSUPPORTED'
  | 'NETWORK_FAILED'
  | 'CHUNK_INTEGRITY_FAILED'
  | 'OUTPUT_MISMATCH'
  | 'DEVICE_LIMIT'
  | 'STORAGE_FULL'
  | 'CANCELLED';

export interface ErrorCopy {
  title: string;
  message: string;
  nextStep: string;
}

export interface PatchErrorShape extends ErrorCopy {
  code: ErrorCode;
  technical: string | null;
}

export const ERROR_COPY: Record<ErrorCode, ErrorCopy> = {
  NOT_ROM: {
    title: 'This is not a ROM',
    message: "The selected file doesn't look like a game ROM.",
    nextStep: 'Choose the Japanese Super Robot Wars L ROM (.nds).',
  },
  WRONG_GAME: {
    title: 'This is a different game',
    message: 'This file is a ROM for another game, not Super Robot Wars L.',
    nextStep: 'Choose the Japanese version of Super Robot Wars L.',
  },
  WRONG_VARIANT: {
    title: 'The version is different',
    message:
      'The size matches, but the contents differ from the ROM this patch supports. ' +
      'This is probably another version or region, or a file that has already been modified.',
    nextStep: 'Use an original Japanese ROM that has never been patched.',
  },
  TRUNCATED: {
    title: 'The file is incomplete',
    message: 'The file is smaller than it should be. The download was probably interrupted.',
    nextStep: 'Download the ROM again, then try once more.',
  },
  ALREADY_PATCHED: {
    title: 'This ROM already contains the translation',
    message: "This file is already the English version, so it doesn't need patching.",
    nextStep: 'Just play this file, or pick the original ROM if you want to start over.',
  },
  MANIFEST_UNSUPPORTED: {
    title: 'This page is out of date',
    message: 'The page is older than the patch data it needs.',
    nextStep: 'Reload the page (Ctrl/Cmd + Shift + R), then try again.',
  },
  NETWORK_FAILED: {
    title: "Couldn't fetch the patch data",
    message: 'The connection dropped while fetching part of the patch.',
    nextStep: 'Check your connection, then press try again.',
  },
  CHUNK_INTEGRITY_FAILED: {
    title: 'The patch data is corrupted',
    message:
      "One part of the patch is damaged or doesn't match, so the process stopped " +
      'to protect your file.',
    nextStep: 'Reload the page and try again. If it keeps failing, report this patch version.',
  },
  OUTPUT_MISMATCH: {
    title: 'The result failed verification',
    message: "The output file doesn't match what it should be, so it wasn't given to you.",
    nextStep: "Try once more. If it keeps failing, report it — don't use the output file.",
  },
  DEVICE_LIMIT: {
    title: 'This device may not be enough',
    message:
      'This process needs about {X} MB of free memory. ' +
      'This device reports less than that available.',
    nextStep: 'Try on a computer, or close other apps and reload the page.',
  },
  STORAGE_FULL: {
    title: 'Storage is full',
    message: "There's no room left to store the temporary result.",
    nextStep: 'Free up some storage, then try again.',
  },
  CANCELLED: {
    title: 'Cancelled',
    message: 'The process was stopped before it finished.',
    nextStep: 'Choose the ROM again to start over.',
  },
};

export class PatchError extends Error {
  readonly code: ErrorCode;
  readonly title: string;
  override readonly message: string;
  readonly nextStep: string;
  readonly technical: string | null;

  constructor(code: ErrorCode, technical: string | null = null, replacements?: Record<string, string>) {
    const copy = ERROR_COPY[code];
    const fill = (s: string): string =>
      replacements
        ? Object.entries(replacements).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), s)
        : s;
    super(fill(copy.message));
    this.name = 'PatchError';
    this.code = code;
    this.title = copy.title;
    this.message = fill(copy.message);
    this.nextStep = fill(copy.nextStep);
    this.technical = technical;
  }

  toJSON(): PatchErrorShape {
    return {
      code: this.code,
      title: this.title,
      message: this.message,
      nextStep: this.nextStep,
      technical: this.technical,
    };
  }
}

export function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ERROR_COPY, v);
}

export function toPatchError(err: unknown): PatchError {
  if (err instanceof PatchError) return err;

  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (isErrorCode(code)) {
      const msg = err instanceof Error ? err.message : null;
      return new PatchError(code, msg);
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (/cancel|dibatalkan/i.test(msg)) return new PatchError('CANCELLED', msg);
  if (/quota|storage|penuh|full/i.test(msg)) return new PatchError('STORAGE_FULL', msg);
  if (/network|fetch|offline|HTTP \d/i.test(msg)) return new PatchError('NETWORK_FAILED', msg);
  if (/manifest|schema/i.test(msg)) return new PatchError('MANIFEST_UNSUPPORTED', msg);
  if (/potongan|chunk|integrity/i.test(msg)) return new PatchError('CHUNK_INTEGRITY_FAILED', msg);
  if (/targetSize|ukuran|size/i.test(msg)) return new PatchError('WRONG_VARIANT', msg);

  return new PatchError('OUTPUT_MISMATCH', msg);
}

export function formatDeviceLimit(megabytes: number): PatchError {
  return new PatchError('DEVICE_LIMIT', null, { X: String(Math.ceil(megabytes)) });
}
