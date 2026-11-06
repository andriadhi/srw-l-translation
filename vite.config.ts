import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Base path GitHub Pages.
 *
 * Repo: https://github.com/<user>/srw-l-translation
 * Situs: https://<user>.github.io/srw-l-translation/
 *
 * GitHub menurunkan slug dari nama repo "SRW L Translation" menjadi
 * "srw-l-translation" (huruf kecil, spasi → tanda hubung). Kalau nama repo
 * berbeda, `base` MUST ikut diubah, kalau tidak semua aset 404 dan halaman
 * tampil kosong.
 *
 * Untuk user/organization site (repo bernama <user>.github.io), base = '/'.
 */
const BASE = '/srw-l-translation/';

export default defineConfig({
  base: BASE,
  build: {
    outDir: 'dist',
    // Aset kecil (gambar, potongan patch) disalin apa adanya dari public/.
    assetsInlineLimit: 4096,
    // Repo berisi potongan patch besar; jangan sourcemap produksi.
    sourcemap: false,
    rollupOptions: {
      /*
       * Dua halaman, dua entri terpisah:
       *   - `main`  → halaman proyek (cover, screenshot, progres, rilis, panduan)
       *   - `patch` → halaman patcher (/patch/)
       *
       * Patcher TIDAK lagi segmen halaman proyek — ia halaman tersendiri yang
       * dibuka lewat tombol "Patch ROM". Karena itu butuh entri build sendiri:
       * tanpa ini Vite hanya memproses index.html dan /patch/ tidak pernah
       * dibangun.
       */
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        patch: resolve(import.meta.dirname, 'patch/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
});
