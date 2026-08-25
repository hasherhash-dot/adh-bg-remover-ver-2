import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Separate project for the pipeline debug harness.
 *
 * It runs the real inference model over real photographs and writes image files
 * for inspection, so it is deliberately kept out of `npm test`. Run it with:
 *
 *   npm run debug:pipeline
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.debug.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    // One image at a time: inference is serialised anyway and the output log is
    // meant to be read top to bottom.
    fileParallelism: false,
    // Let the harness print its report straight to the terminal.
    disableConsoleIntercept: true,
  },
});
