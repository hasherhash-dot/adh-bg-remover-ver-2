import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Declared explicitly rather than derived from tsconfig: the root
      // tsconfig excludes `tests/` so that `next build` does not typecheck the
      // suite, which also puts test files outside any tsconfig-paths project.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws unless resolved under React's react-server
      // condition. Tests exercise these modules directly in Node, so the guard
      // is stubbed out here rather than removed from the source.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
