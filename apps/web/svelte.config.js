import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // The app is a pure client that talks to the API Worker over HTTP and uses
    // no Cloudflare bindings, so keep the dev platform emulation in memory
    // rather than persisting a local SQLite store.
    adapter: adapter({ platformProxy: { persist: false } }),
  },
};

export default config;
