import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    // The environment's API base, inlined at build time by each deploy. Empty
    // for local/preview builds, which fall back to host derivation.
    __RANDOMIFY_API__: JSON.stringify(process.env.PUBLIC_RANDOMIFY_API ?? ''),
  },
});
