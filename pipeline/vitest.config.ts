import { defineConfig } from 'vitest/config';

// DuckDB and PGlite spin up real engines (native + WASM), which can exceed the
// 5s default on slower CI runners. Give tests and hooks generous headroom.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
