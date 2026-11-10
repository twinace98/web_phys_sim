import { defineConfig } from 'vitest/config';

// Relative base + hash routing: the same dist/ works on GitHub Pages
// (sub-path) and on the department web server without rewrite rules.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
