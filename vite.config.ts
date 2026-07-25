/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      // Multi-page: main game + standalone inspector tool
      input: {
        main:      path.resolve(__dirname, 'index.html'),
        inspector: path.resolve(__dirname, 'inspector.html'),
      },
    },
  },
  test: {
    globals: false,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/tests/smoke/**'],
    testTimeout: 30000, // fuzz-parity: 1000 cases × ~713-step sims need >5s with accurate cloth friction
    server: {
      deps: {
        // Pre-bundle 'three' so parallel workers don't race on module transform cache.
        // Without this, 3+ test files importing THREE simultaneously cause ERR_MODULE_NOT_FOUND
        // on first cold run (race in Vite's SSR transform cache).
        inline: ['three'],
      },
    },
  },
});
