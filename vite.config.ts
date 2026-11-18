import { defineConfig } from 'vitest/config';

// Relative base + hash routing: the same dist/ works on GitHub Pages
// (sub-path) and on the department web server without rewrite rules.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  // Heavy stage-layout tests run several times slower on the CI runner than locally.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
});
