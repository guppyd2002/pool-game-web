/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
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
