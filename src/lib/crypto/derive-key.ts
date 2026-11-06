export const KEY_INFO = 'srwl-patch-v1';
export const KEY_LENGTH_BITS = 256;

export interface KeyDerivationInput {
  romSha256Hex: string;
  salt: Uint8Array;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new RangeError(`romSha256Hex harus 64 karakter hex (dapat: ${hex.length})`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function deriveKey(
  input: KeyDerivationInput,
  cryptoImpl: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  if (input.salt.length !== 16) {
    throw new RangeError(`salt harus 16 byte (dapat: ${input.salt.length})`);
  }
  const ikm = hexToBytes(input.romSha256Hex);

  const baseKey = await cryptoImpl.subtle.importKey(
    'raw',
    ikm.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveKey'],
  );

  const key = await cryptoImpl.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: input.salt.buffer as ArrayBuffer,
      info: new TextEncoder().encode(KEY_INFO),
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['decrypt'],
  );

  ikm.fill(0);

  return key;
}

export async function isKeyExtractable(key: CryptoKey): Promise<boolean> {
  return key.extractable;
}
