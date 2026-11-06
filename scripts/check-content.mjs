#!/usr/bin/env node

import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONTENT_DIR = join(ROOT, 'src', 'content');
const MANIFEST = join(ROOT, 'public', 'p', 'manifest.json');

const errors = [];
const notes = [];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function checkProgress() {
  const p = join(CONTENT_DIR, 'progress.json');
  if (!(await exists(p))) {
    notes.push('progress.json belum ada — dilewati');
    return;
  }
  const data = await readJson(p);
  const items = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(items)) {
    errors.push('progress.json: harus berupa larik atau objek dengan properti "items"');
    return;
  }
  items.forEach((it, i) => {
    const where = `progress.json[${i}]`;
    if (typeof it.id !== 'string' || it.id === '') errors.push(`${where}: "id" harus string tidak kosong`);
    if (typeof it.label !== 'string' || it.label === '') errors.push(`${where}: "label" harus string tidak kosong`);
    for (const key of ['translated', 'inGame']) {
      const v = it[key];
      if (v === null) {
        if (typeof it.scope !== 'string' || it.scope.trim() === '') {
          errors.push(`${where}: "${key}" null (belum terhitung) wajib disertai "scope" satu kalimat`);
        }
        continue;
      }
      if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 100) {
        errors.push(`${where}: "${key}" harus angka 0–100 atau null (ditemukan: ${JSON.stringify(v)})`);
      }
      if (typeof it.scope === 'string' && v !== null) {
        notes.push(`${where}: "scope" diabaikan pada kategori yang sudah terhitung`);
      }
    }
  });
  notes.push(`progress.json: ${items.length} item valid`);
}

async function checkVersionMatch() {
  const rel = join(CONTENT_DIR, 'releases.json');
  if (!(await exists(rel))) {
    notes.push('releases.json belum ada — pemeriksaan versi dilewati');
    return;
  }
  if (!(await exists(MANIFEST))) {
    notes.push('public/p/manifest.json belum ada — pemeriksaan versi dilewati');
    return;
  }

  const releases = await readJson(rel);
  const manifest = await readJson(MANIFEST);

  const latest = Array.isArray(releases) ? releases[0] : releases?.releases?.[0];
  if (!latest || typeof latest.version !== 'string') {
    errors.push('releases.json: rilis terbaru harus punya "version" berupa string');
    return;
  }
  if (typeof manifest.patchVersion !== 'string') {
    errors.push('manifest.json: "patchVersion" harus string');
    return;
  }
  if (latest.version !== manifest.patchVersion) {
    errors.push(
      `Versi tidak cocok — releases.json terbaru "${latest.version}" ` +
        `≠ manifest.patchVersion "${manifest.patchVersion}". ` +
        'Halaman akan menampilkan versi yang salah. Build dihentikan.'
    );
    return;
  }
  notes.push(`versi cocok: ${latest.version}`);
}

async function checkManifestShape() {
  if (!(await exists(MANIFEST))) return;
  const m = await readJson(MANIFEST);
  if (!m.source?.sha256) errors.push('manifest.json: "source.sha256" wajib ada');
  if (!m.target?.sha256) errors.push('manifest.json: "target.sha256" wajib ada');
  if (!Array.isArray(m.chunks) || m.chunks.length === 0) {
    errors.push('manifest.json: "chunks" wajib larik tidak kosong');
  }
  for (const [i, c] of (m.chunks ?? []).entries()) {
    if (typeof c?.name !== 'string') errors.push(`manifest.json: chunks[${i}].name wajib string`);
    else if (/patch|srwl|chunk-\d/i.test(c.name)) {
      errors.push(`manifest.json: chunks[${i}].name "${c.name}" membocorkan isi/versi (kontrak §3)`);
    }
  }
}

async function main() {
  await checkProgress();
  await checkManifestShape();
  await checkVersionMatch();

  for (const n of notes) console.log(`  · ${n}`);

  if (errors.length > 0) {
    console.error('\n✗ Pemeriksaan konten GAGAL:\n');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('');
    process.exit(1);
  }
  console.log('✓ Pemeriksaan konten lolos');
}

main().catch((err) => {
  console.error('✗ check-content gagal dijalankan:', err);
  process.exit(1);
});
