import { BpsAction, type ParsedBps } from './parser.ts';
import type { RandomReader } from './reader.ts';
import type { Sink } from '../sink/memory-sink.ts';

const IO_CHUNK = 1024 * 1024;

export interface ApplyOptions {
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
}

export class BpsApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BpsApplyError';
  }
}

export class ApplyCancelled extends Error {
  constructor() {
    super('penerapan dibatalkan');
    this.name = 'ApplyCancelled';
  }
}

export async function applyBps(
  parsed: ParsedBps,
  source: RandomReader,
  patchReader: RandomReader,
  sink: Sink,
  options: ApplyOptions = {},
): Promise<void> {
  const { header, actions } = parsed;

  if (source.size !== header.sourceSize) {
    throw new BpsApplyError(
      `ukuran ROM tidak cocok: ${source.size} byte, patch mengharapkan ${header.sourceSize}`,
    );
  }
  if (sink.size !== header.targetSize) {
    throw new BpsApplyError(
      `ukuran sink tidak cocok: ${sink.size}, target ${header.targetSize}`,
    );
  }

  let outputOffset = 0;
  let targetRelativeOffset = 0;
  let sourceRelativeOffset = 0;
  let done = 0;
  const total = header.targetSize;

  const report = (): void => {
    if (options.onProgress && total > 0) {
      options.onProgress(Math.min(1, done / total));
    }
  };

  for (const action of actions) {
    if (options.shouldCancel?.()) throw new ApplyCancelled();

    switch (action.kind) {
      case BpsAction.SourceRead: {
        let left = action.length;
        let at = outputOffset;
        while (left > 0) {
          const n = Math.min(IO_CHUNK, left);
          const chunk = await source.read(at, n);
          await sink.write(at, chunk);
          at += n;
          left -= n;
        }
        break;
      }

      case BpsAction.TargetRead: {
        let left = action.length;
        let fromPatch = action.dataOffset;
        let at = outputOffset;
        while (left > 0) {
          const n = Math.min(IO_CHUNK, left);
          const chunk = await patchReader.read(fromPatch, n);
          await sink.write(at, chunk);
          fromPatch += n;
          at += n;
          left -= n;
        }
        break;
      }

      case BpsAction.SourceCopy: {
        sourceRelativeOffset += action.relativeOffset;
        if (sourceRelativeOffset < 0) {
          throw new BpsApplyError(`SourceCopy offset negatif: ${sourceRelativeOffset}`);
        }
        if (sourceRelativeOffset + action.length > source.size) {
          throw new BpsApplyError(
            `SourceCopy di luar batas ROM: ${sourceRelativeOffset}+${action.length} > ${source.size}`,
          );
        }
        let left = action.length;
        let from = sourceRelativeOffset;
        let at = outputOffset;
        while (left > 0) {
          const n = Math.min(IO_CHUNK, left);
          const chunk = await source.read(from, n);
          await sink.write(at, chunk);
          from += n;
          at += n;
          left -= n;
        }
        break;
      }

      case BpsAction.TargetCopy: {
        targetRelativeOffset += action.relativeOffset;
        if (targetRelativeOffset < 0) {
          throw new BpsApplyError(`TargetCopy offset negatif: ${targetRelativeOffset}`);
        }
        let left = action.length;
        let from = targetRelativeOffset;
        let at = outputOffset;
        while (left > 0) {
          const available = at - from;
          if (available <= 0) {
            throw new BpsApplyError(
              `TargetCopy membaca data yang belum ditulis: ${from} >= ${at}`,
            );
          }
          const n = Math.min(left, available, IO_CHUNK);
          const chunk = await sink.read(from, n);
          await sink.write(at, chunk);
          from += n;
          at += n;
          left -= n;
        }
        break;
      }

      default: {
        const unknownKind = (action as { kind: number }).kind;
        throw new BpsApplyError(`aksi tidak dikenal: ${unknownKind}`);
      }
    }

    outputOffset += action.length;
    done += action.length;
    report();
  }

  if (outputOffset !== header.targetSize) {
    throw new BpsApplyError(
      `hasil ${outputOffset} byte, seharusnya ${header.targetSize}`,
    );
  }
}
