const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  TABLE[n] = c >>> 0;
}

const INIT = 0xffffffff;
const XOR_OUT = 0xffffffff;

export function crc32(buf: Uint8Array): number {
  let crc = INIT;
  for (let i = 0; i < buf.length; i++) {
    crc = TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ XOR_OUT) >>> 0;
}

export class Crc32 {
  #crc = INIT;

  update(buf: Uint8Array): this {
    let c = this.#crc;
    for (let i = 0; i < buf.length; i++) {
      c = TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    }
    this.#crc = c;
    return this;
  }

  get value(): number {
    return (this.#crc ^ XOR_OUT) >>> 0;
  }
}
