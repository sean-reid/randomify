<script lang="ts">
  import { onMount } from 'svelte';
  import { PLATFORM_BY_ID, type Song, type SpinResponse } from '@randomify/shared';
  import { spin } from '$lib/api';
  import { RecentArtists } from '$lib/recent';

  let current = $state<SpinResponse | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const recent = new RecentArtists();
  let prefetched: Promise<SpinResponse> | null = null;

  async function shuffle(): Promise<void> {
    if (loading) return;
    loading = true;
    error = null;
    try {
      const next = prefetched ?? spin(recent);
      prefetched = null;
      const result = await next;
      current = result;
      recent.add(result.song.artistId);
      // Warm the next spin so the following shuffle lands instantly.
      prefetched = spin(recent);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong.';
    } finally {
      loading = false;
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
    if (event.code === 'Space' && !typing) {
      event.preventDefault();
      void shuffle();
    }
  }

  function meta(song: Song): string {
    const parts: string[] = [];
    if (song.year) parts.push(String(song.year));
    if (song.genres.length) parts.push(song.genres.slice(0, 2).join(', '));
    return parts.join('  ·  ');
  }

  function initial(song: Song): string {
    return song.artist.trim().charAt(0).toUpperCase() || '?';
  }

  onMount(() => {
    void shuffle();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<main>
  <header>
    <h1>randomify</h1>
    <p class="tagline">Shuffle everything.</p>
  </header>

  <section class="stage" aria-live="polite">
    {#if current}
      {@const song = current.song}
      <article class="card" data-testid="result">
        <div class="cover" aria-hidden="true">
          {#if song.coverArtUrl}
            <img src={song.coverArtUrl} alt="" />
          {:else}
            <span>{initial(song)}</span>
          {/if}
        </div>
        <h2 class="title" data-testid="title">{song.title}</h2>
        <p class="artist">{song.artist}</p>
        {#if meta(song)}
          <p class="meta">{meta(song)}</p>
        {/if}
        <ul class="links" data-testid="links">
          {#each current.links as link (link.platform)}
            <li>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.kind === 'search_fallback'
                  ? `Search on ${PLATFORM_BY_ID[link.platform].name}`
                  : `Play on ${PLATFORM_BY_ID[link.platform].name}`}
              >
                {PLATFORM_BY_ID[link.platform].name}
              </a>
            </li>
          {/each}
        </ul>
      </article>
    {:else if error}
      <p class="error" data-testid="error">{error}</p>
    {:else}
      <div class="card placeholder" aria-hidden="true">
        <div class="cover"></div>
        <div class="line wide"></div>
        <div class="line"></div>
      </div>
    {/if}
  </section>

  <button
    class="shuffle"
    onclick={shuffle}
    disabled={loading}
    data-testid="shuffle"
    aria-label="Shuffle to a new song"
  >
    {loading ? 'Finding a song' : 'Shuffle'}
  </button>

  <p class="hint">Press <kbd>space</kbd> for another</p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.75rem;
    max-width: var(--maxw);
    margin: 0 auto;
    padding: clamp(2rem, 6vh, 4.5rem) 1.25rem 3rem;
    min-height: 100svh;
  }

  header {
    text-align: center;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: clamp(1.7rem, 6vw, 2.3rem);
    letter-spacing: -0.02em;
  }

  .tagline {
    margin: 0.4rem 0 0;
    color: var(--ink-soft);
    font-size: 0.98rem;
  }

  .stage {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .card {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 1.75rem 1.5rem 1.5rem;
    text-align: center;
    box-shadow: 0 1px 2px rgba(20, 20, 20, 0.04);
  }

  .cover {
    width: 132px;
    height: 132px;
    margin: 0 auto 1.25rem;
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover span {
    font-family: var(--font-display);
    font-size: 3rem;
    color: var(--ink-soft);
  }

  .title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .artist {
    margin: 0.35rem 0 0;
    font-size: 1.05rem;
    color: var(--ink);
  }

  .meta {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .links {
    list-style: none;
    margin: 1.5rem 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .links a {
    display: inline-block;
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.85rem;
    color: var(--ink);
    text-decoration: none;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .links a:hover {
    border-color: var(--ink);
    background: var(--bg);
  }

  .placeholder .line {
    height: 0.95rem;
    border-radius: 6px;
    background: var(--bg);
    margin: 0.6rem auto 0;
    width: 45%;
  }

  .placeholder .line.wide {
    width: 70%;
    height: 1.3rem;
  }

  .error {
    color: #8a2b2b;
    font-size: 0.95rem;
  }

  .shuffle {
    appearance: none;
    border: none;
    background: var(--accent);
    color: #fafafa;
    font-size: 1.05rem;
    font-weight: 500;
    padding: 0.85rem 2.4rem;
    border-radius: 999px;
    cursor: pointer;
    transition:
      transform 0.12s ease,
      opacity 0.15s ease;
  }

  .shuffle:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .shuffle:active:not(:disabled) {
    transform: translateY(0);
  }

  .shuffle:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .shuffle:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 3px;
  }

  .hint {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
</style>
