/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000, // fuzz-parity: 1000 cases × ~713-step sims need >5s with accurate cloth friction
  },
});
