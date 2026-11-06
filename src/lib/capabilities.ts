export interface Capabilities {
  webWorker: boolean;
  wasm: boolean;
  opfs: boolean;
  deviceMemoryGB: number | null;
  storageQuotaBytes: number | null;
  storageAvailableBytes: number | null;
}

function hasOpfs(nav: Navigator, win: Window & typeof globalThis): boolean {
  const storage = (nav as Navigator & { storage?: StorageManager }).storage;
  if (!storage || typeof storage.getDirectory !== 'function') return false;
  return typeof (win as { FileSystemFileHandle?: unknown }).FileSystemFileHandle === 'function';
}

function hasWasm(): boolean {
  try {
    if (typeof WebAssembly !== 'object') return false;
    const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export async function detectCapabilities(
  nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  win: (Window & typeof globalThis) | undefined =
    typeof window === 'undefined' ? undefined : window,
): Promise<Capabilities> {
  const hasWorker = typeof Worker === 'function';

  if (!nav || !win) {
    return {
      webWorker: hasWorker,
      wasm: hasWasm(),
      opfs: false,
      deviceMemoryGB: null,
      storageQuotaBytes: null,
      storageAvailableBytes: null,
    };
  }

  const rawMemory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
  const deviceMemoryGB =
    typeof rawMemory === 'number' && Number.isFinite(rawMemory) && rawMemory > 0
      ? rawMemory
      : null;

  let storageQuotaBytes: number | null = null;
  let storageAvailableBytes: number | null = null;
  const storage = (nav as Navigator & { storage?: StorageManager }).storage;
  if (storage && typeof storage.estimate === 'function') {
    try {
      const est = await storage.estimate();
      if (typeof est.quota === 'number' && est.quota > 0) storageQuotaBytes = est.quota;
      if (typeof est.usage === 'number' && storageQuotaBytes !== null) {
        storageAvailableBytes = Math.max(0, storageQuotaBytes - est.usage);
      }
    } catch {
    }
  }

  return {
    webWorker: hasWorker,
    wasm: hasWasm(),
    opfs: hasOpfs(nav, win),
    deviceMemoryGB,
    storageQuotaBytes,
    storageAvailableBytes,
  };
}

export function canProcess(caps: Capabilities): boolean {
  return caps.webWorker && caps.wasm;
}

export function estimateMemoryBytes(romSizeBytes: number): number {
  const CHUNK = 4 * 1024 * 1024;
  const WORKER_MARGIN = 32 * 1024 * 1024;
  return romSizeBytes + CHUNK * 2 + WORKER_MARGIN;
}

export function estimateMemoryMB(romSizeBytes: number): number {
  return Math.ceil(estimateMemoryBytes(romSizeBytes) / (1024 * 1024));
}

export function deviceLimitVerdict(
  caps: Capabilities,
  romSizeBytes: number,
): 'ok' | 'limited' | 'unknown' {
  const need = estimateMemoryBytes(romSizeBytes);
  if (caps.deviceMemoryGB !== null) {
    const available = caps.deviceMemoryGB * 1024 * 1024 * 1024;
    if (available * 0.5 < need) return 'limited';
    return 'ok';
  }
  if (caps.storageAvailableBytes !== null) {
    if (caps.storageAvailableBytes < need) return 'limited';
    return 'ok';
  }
  return 'unknown';
}
