import { defineConfig } from 'vitest/config';

// Unit tests only. Kept separate from vite.config.ts so the SvelteKit plugin is
// not loaded for plain TypeScript module tests. Playwright covers the UI.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
