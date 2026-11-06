import type { RandomReader } from './reader.ts';
import { readVarint } from './varint.ts';

export const BPS_MAGIC = 0x31535042;

export enum BpsAction {
  SourceRead = 0,
  TargetRead = 1,
  SourceCopy = 2,
  TargetCopy = 3,
}

export interface BpsActionBase {
  readonly kind: BpsAction;
  readonly length: number;
}

export interface SourceReadAction extends BpsActionBase {
  readonly kind: BpsAction.SourceRead;
}

export interface TargetReadAction extends BpsActionBase {
  readonly kind: BpsAction.TargetRead;
  readonly dataOffset: number;
}

export interface SourceCopyAction extends BpsActionBase {
  readonly kind: BpsAction.SourceCopy;
  readonly relativeOffset: number;
}

export interface TargetCopyAction extends BpsActionBase {
  readonly kind: BpsAction.TargetCopy;
  readonly relativeOffset: number;
}

export type BpsActionRecord =
  | SourceReadAction
  | TargetReadAction
  | SourceCopyAction
  | TargetCopyAction;

export interface BpsHeader {
  sourceSize: number;
  targetSize: number;
  metadataSize: number;
  metadata: Uint8Array | null;
}

export interface BpsFooter {
  sourceChecksum: number;
  targetChecksum: number;
  patchChecksum: number;
}

export interface ParsedBps {
  header: BpsHeader;
  actions: BpsActionRecord[];
  footer: BpsFooter;
  patchSize: number;
}

export class BpsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BpsParseError';
  }
}

export function decodeSignedOffset(raw: number): number {
  const negative = (raw & 1) === 1;
  const magnitude = Math.floor(raw / 2);
  if (magnitude === 0) return 0;
  return negative ? -magnitude : magnitude;
}

export function varintLen(value: number): number {
  let len = 0;
  let v = value;
  do {
    v = Math.floor(v / 128);
    len += 1;
  } while (v > 0);
  return len;
}

class ActionCursor {
  #reader: RandomReader;
  #limit: number;
  #buf: Uint8Array = new Uint8Array(0);
  #base = 0;
  #pos = 0;

  static readonly WINDOW = 64 * 1024;

  constructor(reader: RandomReader, start: number, limit: number) {
    this.#reader = reader;
    this.#base = start;
    this.#limit = limit;
  }

  get offset(): number {
    return this.#base + this.#pos;
  }

  get atEnd(): boolean {
    return this.offset >= this.#limit;
  }

  async #fill(need: number): Promise<void> {
    if (this.#pos + need <= this.#buf.length) return;
    const remaining = this.#buf.length - this.#pos;
    const size = Math.max(ActionCursor.WINDOW, remaining + need);
    const next = new Uint8Array(size);
    if (remaining > 0) next.set(this.#buf.subarray(this.#pos), 0);
    const readAt = this.#base + this.#pos;
    const want = Math.min(size - remaining, this.#limit - readAt);
    if (want > 0) {
      const chunk = await this.#reader.read(readAt, want);
      next.set(chunk, remaining);
    }
    this.#base = readAt;
    this.#pos = 0;
    this.#buf = next;
  }

  async byte(): Promise<number> {
    await this.#fill(1);
    if (this.#pos >= this.#buf.length) {
      throw new BpsParseError('tabel aksi terpotong');
    }
    return this.#buf[this.#pos++]!;
  }

  async varint(): Promise<number> {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = await this.byte();
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 63 || value > Number.MAX_SAFE_INTEGER) {
        throw new BpsParseError('varint terlalu besar — file bukan BPS yang valid');
      }
    }
    return value;
  }

  async skip(n: number): Promise<void> {
    let left = n;
    while (left > 0) {
      if (this.#pos >= this.#buf.length) {
        await this.#fill(1);
        if (this.#pos >= this.#buf.length) {
          throw new BpsParseError('tabel aksi terpotong saat melewati payload');
        }
      }
      const take = Math.min(left, this.#buf.length - this.#pos);
      this.#pos += take;
      left -= take;
    }
  }
}

export async function readHeader(reader: RandomReader): Promise<BpsHeader> {
  if (reader.size < 4 + 3 + 12) {
    throw new BpsParseError(`file terlalu kecil untuk paket BPS (${reader.size} byte)`);
  }
  const head = await reader.read(0, Math.min(40, reader.size));
  if (
    head[0] !== 0x42 || head[1] !== 0x50 || head[2] !== 0x53 || head[3] !== 0x31
  ) {
    const got = String.fromCharCode(head[0]!, head[1]!, head[2]!, head[3]!);
    throw new BpsParseError(`magic bukan "BPS1" (dapat: ${JSON.stringify(got)})`);
  }
  const r1 = readVarint(head, 4);
  const r2 = readVarint(head, r1.pos);
  const r3 = readVarint(head, r2.pos);
  const header: BpsHeader = {
    sourceSize: r1.value,
    targetSize: r2.value,
    metadataSize: r3.value,
    metadata: null,
  };
  const metaStart = r3.pos;
  if (header.metadataSize > 0) {
    if (metaStart + header.metadataSize > reader.size - 12) {
      throw new BpsParseError('metadata melewati batas tabel aksi');
    }
    header.metadata = await reader.read(metaStart, header.metadataSize);
  }
  return header;
}

export async function readFooter(reader: RandomReader): Promise<BpsFooter> {
  const buf = await reader.read(reader.size - 12, 12);
  const dv = new DataView(buf.buffer, buf.byteOffset, 12);
  return {
    sourceChecksum: dv.getUint32(0, true),
    targetChecksum: dv.getUint32(4, true),
    patchChecksum: dv.getUint32(8, true),
  };
}

export async function parseBps(reader: RandomReader): Promise<ParsedBps> {
  const header = await readHeader(reader);
  const footer = await readFooter(reader);
  const patchSize = reader.size;

  const actionsStart =
    4 +
    varintLen(header.sourceSize) +
    varintLen(header.targetSize) +
    varintLen(header.metadataSize) +
    header.metadataSize;
  const actionsEnd = patchSize - 12;

  if (actionsStart > actionsEnd) {
    throw new BpsParseError(
      `header melewati tabel aksi (awal ${actionsStart} > akhir ${actionsEnd})`,
    );
  }

  const cursor = new ActionCursor(reader, actionsStart, actionsEnd);
  const actions: BpsActionRecord[] = [];

  let sourceRelativeOffset = 0;
  let targetRelativeOffset = 0;
  let outputOffset = 0;

  while (!cursor.atEnd) {
    const data = await cursor.varint();
    const kind = (data & 3) as BpsAction;
    const length = Math.floor(data / 4) + 1;

    if (outputOffset + length > header.targetSize) {
      throw new BpsParseError(
        `aksi ${kind} melewati targetSize pada outputOffset ${outputOffset} (+${length})`,
      );
    }

    switch (kind) {
      case BpsAction.SourceRead: {
        actions.push({ kind, length });
        outputOffset += length;
        break;
      }

      case BpsAction.TargetRead: {
        const dataOffset = cursor.offset;
        if (dataOffset + length > actionsEnd) {
          throw new BpsParseError(
            `payload TargetRead melewati tabel aksi pada ${dataOffset} (+${length})`,
          );
        }
        await cursor.skip(length);
        actions.push({ kind, length, dataOffset });
        outputOffset += length;
        break;
      }

      case BpsAction.SourceCopy: {
        const raw = await cursor.varint();
        const rel = decodeSignedOffset(raw);
        sourceRelativeOffset += rel;
        if (sourceRelativeOffset < 0) {
          throw new BpsParseError(`SourceCopy offset negatif: ${sourceRelativeOffset}`);
        }
        if (sourceRelativeOffset + length > header.sourceSize) {
          throw new BpsParseError(
            `SourceCopy di luar batas source: ${sourceRelativeOffset}+${length} > ${header.sourceSize}`,
          );
        }
        actions.push({ kind, length, relativeOffset: rel });
        outputOffset += length;
        break;
      }

      case BpsAction.TargetCopy: {
        const raw = await cursor.varint();
        const rel = decodeSignedOffset(raw);
        targetRelativeOffset += rel;
        if (targetRelativeOffset < 0) {
          throw new BpsParseError(`TargetCopy offset negatif: ${targetRelativeOffset}`);
        }
        if (targetRelativeOffset > outputOffset) {
          throw new BpsParseError(
            `TargetCopy membaca data yang belum ditulis: ${targetRelativeOffset} > ${outputOffset}`,
          );
        }
        actions.push({ kind, length, relativeOffset: rel });
        outputOffset += length;
        break;
      }

      default:
        throw new BpsParseError(`aksi tidak dikenal: ${kind}`);
    }
  }

  if (outputOffset !== header.targetSize) {
    throw new BpsParseError(
      `aksi menghasilkan ${outputOffset} byte, tetapi targetSize = ${header.targetSize}`,
    );
  }

  return { header, actions, footer, patchSize };
}
