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
    // Runs on every `npm test` (so in the Vercel build too): the budget engine must stay fully covered.
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['server/**/*.ts'],
      exclude: ['server/db/generated/**'],
      reporter: ['text-summary'],
      thresholds: {
        'server/budget/engine.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
