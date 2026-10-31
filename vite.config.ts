import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The SPA lives in web/ and builds to dist/ at the repo root (vercel.json "outputDirectory").
export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@web': fileURLToPath(new URL('./web/src', import.meta.url)),
      // Pure, dependency-free server modules shared with the SPA (e.g. lib/money.ts).
      '@server': fileURLToPath(new URL('./server', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
