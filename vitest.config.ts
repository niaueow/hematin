import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure unit tests: no database, no env secrets (AGENTS.md).
export default defineConfig({
  resolve: {
    alias: {
      '@server': fileURLToPath(new URL('./server', import.meta.url)),
      '@web': fileURLToPath(new URL('./web/src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
