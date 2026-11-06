export const MANIFEST_SCHEMA = 1;
export const MAX_CHUNK_SIZE = 8 * 1024 * 1024;
export const GCM_TAG_BYTES = 16;

export class ManifestError extends Error {
  readonly code: string;
  constructor(message: string, code = 'MANIFEST_UNSUPPORTED') {
    super(message);
    this.name = 'ManifestError';
    this.code = code;
  }
}

export interface ManifestChunk {
  index: number;
  name: string;
  bytes: number;
}

export interface Manifest {
  schema: number;
  patchVersion: string;
  releasedAt: string;
  game: { title: string; platform: string; region: string };
  source: { sha256: string; sizeBytes: number };
  target: { sha256: string; sizeBytes: number; fileName: string };
  compression: { format: string; patchBytes: number };
  encryption: {
    kdf: string;
    hash: string;
    cipher: string;
    salt: Uint8Array;
    info: string;
    chunkSize: number;
    chunkCount: number;
    ivPrefix: Uint8Array;
  };
  chunks: ManifestChunk[];
  notes?: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new ManifestError('nilai base64 kosong');
  }
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ManifestError('nilai base64 tidak sah');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireObject(v: unknown, where: string): Record<string, unknown> {
  if (!isPlainObject(v)) {
    throw new ManifestError(`${where} harus berupa objek`);
  }
  return v;
}

function requireString(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new ManifestError(`${where} harus string tidak kosong`);
  }
  return v;
}

function requireNonNegativeInt(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new ManifestError(`${where} harus bilangan bulat >= 0 (dapat: ${JSON.stringify(v)})`);
  }
  return v;
}

export function validateManifest(raw: unknown): Manifest {
  const m = requireObject(raw, 'manifest');

  if (m['schema'] !== MANIFEST_SCHEMA) {
    throw new ManifestError(
      `schema manifest tidak didukung: ${JSON.stringify(m['schema'])} (diharapkan ${MANIFEST_SCHEMA})`,
      'MANIFEST_UNSUPPORTED',
    );
  }

  const patchVersion = requireString(m['patchVersion'], 'patchVersion');
  const releasedAt = requireString(m['releasedAt'], 'releasedAt');

  const game = requireObject(m['game'], 'game');
  requireString(game['title'], 'game.title');
  requireString(game['platform'], 'game.platform');
  requireString(game['region'], 'game.region');

  const source = requireObject(m['source'], 'source');
  const sourceSha = requireString(source['sha256'], 'source.sha256');
  if (!HEX64.test(sourceSha)) {
    throw new ManifestError(
      'source.sha256 harus 64 karakter hex huruf kecil',
      'MANIFEST_UNSUPPORTED',
    );
  }
  const sourceSize = requireNonNegativeInt(source['sizeBytes'], 'source.sizeBytes');

  const target = requireObject(m['target'], 'target');
  const targetSha = requireString(target['sha256'], 'target.sha256');
  if (!HEX64.test(targetSha)) {
    throw new ManifestError(
      'target.sha256 harus 64 karakter hex huruf kecil',
      'MANIFEST_UNSUPPORTED',
    );
  }
  const targetSize = requireNonNegativeInt(target['sizeBytes'], 'target.sizeBytes');

  const fileName = requireString(target['fileName'], 'target.fileName');
  if (CONTROL_CHARS.test(fileName)) {
    throw new ManifestError('target.fileName mengandung karakter kontrol');
  }
  if (!fileName.toLowerCase().endsWith('.nds')) {
    throw new ManifestError(`target.fileName harus berakhiran .nds (dapat: ${fileName})`);
  }

  const compression = requireObject(m['compression'], 'compression');
  requireString(compression['format'], 'compression.format');
  const patchBytes = requireNonNegativeInt(compression['patchBytes'], 'compression.patchBytes');

  const enc = requireObject(m['encryption'], 'encryption');
  requireString(enc['kdf'], 'encryption.kdf');
  requireString(enc['hash'], 'encryption.hash');
  requireString(enc['cipher'], 'encryption.cipher');
  const info = requireString(enc['info'], 'encryption.info');

  const chunkSize = requireNonNegativeInt(enc['chunkSize'], 'encryption.chunkSize');
  if (chunkSize === 0 || chunkSize > MAX_CHUNK_SIZE) {
    throw new ManifestError(
      `encryption.chunkSize harus 1..${MAX_CHUNK_SIZE} (dapat: ${chunkSize})`,
    );
  }
  const chunkCount = requireNonNegativeInt(enc['chunkCount'], 'encryption.chunkCount');

  const salt = base64ToBytes(requireString(enc['salt'], 'encryption.salt'));
  if (salt.length !== 16) {
    throw new ManifestError(`encryption.salt harus 16 byte (dapat: ${salt.length})`);
  }
  const ivPrefix = base64ToBytes(requireString(enc['ivPrefix'], 'encryption.ivPrefix'));
  if (ivPrefix.length !== 8) {
    throw new ManifestError(`encryption.ivPrefix harus 8 byte (dapat: ${ivPrefix.length})`);
  }

  const rawChunks = m['chunks'];
  if (!Array.isArray(rawChunks)) {
    throw new ManifestError('chunks harus berupa larik');
  }
  if (rawChunks.length !== chunkCount) {
    throw new ManifestError(
      `chunks berisi ${rawChunks.length} entri, seharusnya ${chunkCount}`,
    );
  }
  const chunks: ManifestChunk[] = rawChunks.map((c, i) => {
    const obj = requireObject(c, `chunks[${i}]`);
    const index = requireNonNegativeInt(obj['index'], `chunks[${i}].index`);
    const name = requireString(obj['name'], `chunks[${i}].name`);
    const bytes = requireNonNegativeInt(obj['bytes'], `chunks[${i}].bytes`);
    if (bytes > chunkSize + GCM_TAG_BYTES) {
      throw new ManifestError(
        `chunks[${i}].bytes ${bytes} melebihi chunkSize+16 (${chunkSize + GCM_TAG_BYTES})`,
      );
    }
    return { index, name, bytes };
  });
  const seen = new Set<number>();
  for (const c of chunks) {
    if (c.index >= chunkCount) {
      throw new ManifestError(`index potongan ${c.index} di luar rentang 0..${chunkCount - 1}`);
    }
    if (seen.has(c.index)) {
      throw new ManifestError(`index potongan ${c.index} duplikat`);
    }
    seen.add(c.index);
  }
  for (let i = 0; i < chunkCount; i++) {
    if (!seen.has(i)) {
      throw new ManifestError(`index potongan ${i} hilang — daftar potongan harus lengkap`);
    }
  }

  const totalChunkBytes = chunks.reduce((n, c) => n + c.bytes, 0);
  const expectedTotal = patchBytes + chunkCount * GCM_TAG_BYTES;
  if (totalChunkBytes !== expectedTotal) {
    throw new ManifestError(
      `jumlah byte potongan ${totalChunkBytes} tidak sama dengan patchBytes+tag ${expectedTotal}`,
    );
  }

  const notes = typeof m['notes'] === 'string' ? m['notes'] : undefined;

  return {
    schema: MANIFEST_SCHEMA,
    patchVersion,
    releasedAt,
    game: {
      title: game['title'] as string,
      platform: game['platform'] as string,
      region: game['region'] as string,
    },
    source: { sha256: sourceSha, sizeBytes: sourceSize },
    target: { sha256: targetSha, sizeBytes: targetSize, fileName },
    compression: { format: compression['format'] as string, patchBytes },
    encryption: {
      kdf: enc['kdf'] as string,
      hash: enc['hash'] as string,
      cipher: enc['cipher'] as string,
      salt,
      info,
      chunkSize,
      chunkCount,
      ivPrefix,
    },
    chunks,
    ...(notes === undefined ? {} : { notes }),
  };
}

export async function loadManifest(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Manifest> {
  let res: Response;
  try {
    res = await fetchImpl(url, { cache: 'no-cache' });
  } catch {
    throw new ManifestError('manifest tidak bisa diambil — periksa koneksi', 'NETWORK_FAILED');
  }
  if (!res.ok) {
    throw new ManifestError(
      `manifest tidak bisa diambil (HTTP ${res.status})`,
      'NETWORK_FAILED',
    );
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new ManifestError('manifest bukan JSON yang sah');
  }
  return validateManifest(raw);
}

export function chunkAt(manifest: Manifest, index: number): ManifestChunk {
  const found = manifest.chunks.find((c) => c.index === index);
  if (!found) {
    throw new ManifestError(`potongan index ${index} tidak ada di manifest`);
  }
  return found;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function manifestToJSON(manifest: Manifest): Record<string, unknown> {
  return {
    schema: manifest.schema,
    patchVersion: manifest.patchVersion,
    releasedAt: manifest.releasedAt,
    game: { ...manifest.game },
    source: { ...manifest.source },
    target: { ...manifest.target },
    compression: { ...manifest.compression },
    encryption: {
      kdf: manifest.encryption.kdf,
      hash: manifest.encryption.hash,
      cipher: manifest.encryption.cipher,
      salt: bytesToBase64(manifest.encryption.salt),
      info: manifest.encryption.info,
      chunkSize: manifest.encryption.chunkSize,
      chunkCount: manifest.encryption.chunkCount,
      ivPrefix: bytesToBase64(manifest.encryption.ivPrefix),
    },
    chunks: manifest.chunks.map((c) => ({ ...c })),
    ...(manifest.notes === undefined ? {} : { notes: manifest.notes }),
  };
}

export function stringifyManifest(manifest: Manifest): string {
  return JSON.stringify(manifestToJSON(manifest), null, 2);
}
