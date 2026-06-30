import { defineConfig } from 'vitest/config';

// The Postgres-walk tests run PGlite (WASM Postgres), whose startup can exceed
// the 5s default on slower CI runners. Give tests and hooks generous headroom.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
