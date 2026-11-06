<script lang="ts">
  import '../app.css';
  import { resolveApiBase } from '$lib/api';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="preconnect" href={resolveApiBase()} crossorigin="anonymous" />
  <link rel="preconnect" href="https://cdn-images.dzcdn.net" />
  <link rel="preconnect" href="https://cdnt-preview.dzcdn.net" />
</svelte:head>

{@render children()}
