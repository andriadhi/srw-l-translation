export function decodeVarint(
  next: () => number,
): number {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = next();
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 63) {
      throw new RangeError('varint terlalu panjang — file bukan BPS yang valid');
    }
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new RangeError('varint melebihi Number.MAX_SAFE_INTEGER');
    }
  }
  return value;
}

export function readVarint(
  buf: Uint8Array,
  pos: number,
): { value: number; pos: number } {
  let value = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) {
      throw new RangeError('varint terpotong di akhir buffer');
    }
    const byte = buf[pos]!;
    pos += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 63) {
      throw new RangeError('varint terlalu panjang — file bukan BPS yang valid');
    }
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new RangeError('varint melebihi Number.MAX_SAFE_INTEGER');
    }
  }
  return { value, pos };
}

export function encodeVarint(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`varint hanya untuk bilangan bulat >= 0 (dapat: ${value})`);
  }
  const out: number[] = [];
  let v = value;
  do {
    let byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) byte += 0x80;
    out.push(byte);
  } while (v > 0);
  return Uint8Array.from(out);
}
