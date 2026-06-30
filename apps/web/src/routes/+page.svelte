<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PLATFORM_BY_ID, type Song, type SpinResponse } from '@randomify/shared';
  import { spin } from '$lib/api';
  import { RecentArtists } from '$lib/recent';

  // A deck of spun songs: you walk back through ones you heard (left) and
  // forward to discover new ones (right). `index` is the current position.
  let history = $state<SpinResponse[]>([]);
  let index = $state(-1);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let playing = $state(false);
  let playerError = $state(false);
  let audioEl = $state<HTMLAudioElement>();

  // Safari blocks a play() that is not inside a user gesture, so the first
  // gesture primes the element (a muted play/pause) to bless later autoplay.
  let primed = false;

  // Bumped on every song change / pause so a late play()/fade promise from a
  // previous track can detect it is stale and bail instead of fighting volume.
  let playToken = 0;
  // Cap the deck so a long session does not grow history unbounded.
  const HISTORY_CAP = 60;

  const recent = new RecentArtists();
  let prefetched: Promise<SpinResponse> | null = null;

  const current = $derived(index >= 0 ? (history[index] ?? null) : null);
  const song = $derived(current?.song ?? null);
  const canPrev = $derived(index > 0);

  // Concise screen-reader status: announced on song change / error, instead of
  // making the whole card a live region (which re-reads everything each spin).
  const status = $derived(
    song ? `${song.title} by ${song.artist}${playerError ? ', preview unavailable' : ''}` : '',
  );

  let fadeTimer: ReturnType<typeof setInterval> | undefined;

  function prefersReducedMotion(): boolean {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /** Ramp the audio volume toward `target`; pause once it reaches silence. */
  function fadeTo(target: number, ms = 300): void {
    const el = audioEl;
    if (!el) return;
    clearInterval(fadeTimer);
    if (prefersReducedMotion()) {
      el.volume = target;
      if (target === 0) el.pause();
      return;
    }
    const start = el.volume;
    const steps = 15;
    let i = 0;
    fadeTimer = setInterval(() => {
      i += 1;
      el.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
      if (i >= steps) {
        clearInterval(fadeTimer);
        if (target === 0) el.pause();
      }
    }, ms / steps);
  }

  /** Play from silence and fade in; restore volume if autoplay is blocked.
   * Captures the current token so a late resolve on a superseded track no-ops. */
  function playFadeIn(): void {
    const el = audioEl;
    if (!el) return;
    const token = playToken;
    el.volume = 0;
    el.play().then(
      () => {
        if (token === playToken) fadeTo(1);
      },
      () => {
        if (token !== playToken) return;
        el.volume = 1;
        playing = false;
      },
    );
  }

  /**
   * Prime the audio element inside a user gesture (a silent play/pause) so that
   * later script-initiated autoplay is permitted, notably on Safari. No-op once
   * primed or once any real playback has started.
   */
  function unlockAudio(): void {
    const el = audioEl;
    if (primed || !el) return;
    primed = true;
    const wasMuted = el.muted;
    el.muted = true;
    Promise.resolve(el.play())
      .then(() => {
        el.pause();
        el.muted = wasMuted;
      })
      .catch(() => {
        el.muted = wasMuted;
        primed = false;
      });
  }

  /** Run a navigation action from a user gesture, priming audio first. */
  function go(action: () => void): void {
    unlockAudio();
    action();
  }

  /**
   * Preflight a preview without the browser logging a failed request: a manual
   * redirect means a live preview resolves to an opaque redirect (302 to
   * Deezer) and a dead one to our Worker's 404 - both clean fetch outcomes, no
   * console error. Only validated previews are ever given to an <audio>.
   */
  async function isPreviewLive(proxyUrl: string): Promise<boolean> {
    try {
      const res = await fetch(proxyUrl, { redirect: 'manual' });
      return res.type === 'opaqueredirect' || res.ok;
    } catch {
      return false;
    }
  }

  /** A committed (preflighted) preview failed at play time - rare, e.g. it went
   * unavailable since. Hide the player; never flash/skip. */
  function onPreviewError(): void {
    playing = false;
    if (song?.previewUrl) playerError = true;
  }

  /** Preload and decode a cover so it appears in sync with the title. */
  async function loadCover(url: string | null): Promise<void> {
    if (!url || typeof Image === 'undefined') return;
    const img = new Image();
    img.src = url;
    try {
      await Promise.race([img.decode(), new Promise((resolve) => setTimeout(resolve, 1200))]);
    } catch {
      // Show the card regardless if the cover fails to decode.
    }
  }

  /**
   * Discover a fresh song: drop any forward history, append, move to it. A
   * candidate whose preview won't play is skipped before it is ever shown (no
   * flash, no entry in history), trying a few more before giving up.
   */
  async function discover(): Promise<void> {
    if (loading) return;
    loading = true;
    error = null;
    try {
      let result: SpinResponse | null = null;
      for (let attempt = 0; attempt < 6 && !result; attempt += 1) {
        const candidate = await (prefetched ?? spin(recent));
        prefetched = null;
        const url = candidate.song.previewUrl;
        // Only commit a song we can actually play: it must have a preview and it
        // must load. Validate and warm the cover together so a committed song
        // shows art and title in sync.
        const [playable] = await Promise.all([
          url ? isPreviewLive(url) : Promise.resolve(false),
          loadCover(candidate.song.coverArtUrl),
        ]);
        if (playable) {
          result = candidate;
        } else {
          recent.add(candidate.song.artistId);
          prefetched = spin(recent);
        }
      }
      if (!result) {
        error = 'Could not find a playable song. Try shuffling again.';
        return;
      }
      const deck = [...history.slice(0, index + 1), result];
      history = deck.length > HISTORY_CAP ? deck.slice(deck.length - HISTORY_CAP) : deck;
      index = history.length - 1;
      recent.add(result.song.artistId);
      // Warm the next spin and preload its cover so the next discover is instant.
      const warm = spin(recent);
      prefetched = warm;
      void warm.then((r) => loadCover(r.song.coverArtUrl));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong.';
    } finally {
      loading = false;
    }
  }

  /** Forward in the deck, or discover a fresh song when at the front. */
  function next(): void {
    if (index < history.length - 1) index += 1;
    else void discover();
  }

  function prev(): void {
    if (canPrev) index -= 1;
  }

  function togglePlay(): void {
    if (!audioEl || !song?.previewUrl || playerError) return;
    if (audioEl.paused) playFadeIn();
    else {
      playToken += 1; // a pending play() must not re-start after a manual pause
      fadeTo(0, 200);
    }
  }

  // Autoplay each new song's preview with a short fade-in. Re-runs when the song
  // changes. The first page load has no user gesture, so autoplay may be blocked
  // by the browser; that is fine: it stays paused with the play affordance shown.
  $effect(() => {
    const url = song?.previewUrl ?? null;
    song?.recordingId;
    if (!audioEl) return;
    playToken += 1; // new track: supersede any in-flight play()/fade
    playerError = false;
    if (url) playFadeIn();
    else audioEl.pause();
  });

  onDestroy(() => clearInterval(fadeTimer));

  let touchX = 0;
  let touchY = 0;
  let touchAt = 0;
  function onTouchStart(event: TouchEvent): void {
    const t = event.changedTouches[0];
    touchX = t.clientX;
    touchY = t.clientY;
    touchAt = event.timeStamp;
  }
  function onTouchEnd(event: TouchEvent): void {
    const t = event.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    const dt = event.timeStamp - touchAt;
    // A deliberate horizontal flick: far enough, mostly horizontal, and quick
    // enough that a slow drag / text-selection / press does not navigate.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      unlockAudio();
      if (dx < 0) next();
      else prev();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable)
      return;
    if (event.code === 'Space') {
      // If a control button is focused, let its native activation handle Space
      // (avoids a double toggle from this window handler + the button click).
      if (target?.tagName === 'BUTTON') return;
      event.preventDefault();
      unlockAudio();
      togglePlay();
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      go(next);
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      go(prev);
    }
  }

  // Genres are intentionally not surfaced yet: MusicBrainz only tags ~half the
  // release groups, so the line was blank too often. Show just the year until
  // there is a better genre source. Genre data is still stored on the song.
  function meta(s: Song): string {
    return s.year ? String(s.year) : '';
  }

  function initial(s: Song): string {
    return s.artist.trim().charAt(0).toUpperCase() || '?';
  }

  /** Defense-in-depth: never render a non-https link href from corpus data. */
  function safeUrl(url: string): string {
    return url.startsWith('https://') ? url : '#';
  }

  onMount(() => {
    void discover();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<main>
  <header>
    <h1>randomify</h1>
    <p class="tagline">Shuffle everything.</p>
  </header>

  {#snippet playIcon()}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
  {/snippet}
  {#snippet pauseIcon()}
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" /></svg
    >
  {/snippet}
  {#snippet prevIcon()}
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      /></svg
    >
  {/snippet}
  {#snippet nextIcon()}
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M9 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      /></svg
    >
  {/snippet}

  <p class="sr-only" aria-live="polite" data-testid="status">{status}</p>

  <section class="stage">
    {#if current}
      {@const song = current.song}
      <article
        class="card"
        data-testid="result"
        ontouchstart={onTouchStart}
        ontouchend={onTouchEnd}
      >
        {#if song.previewUrl}
          <button
            class="cover cover-btn"
            onclick={togglePlay}
            aria-pressed={playing}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            data-testid="cover-toggle"
          >
            {#if song.coverArtUrl}
              <img src={song.coverArtUrl} alt="" />
            {:else}
              <span>{initial(song)}</span>
            {/if}
            <span class="play-overlay" class:playing aria-hidden="true">
              {@render (playing ? pauseIcon : playIcon)()}
            </span>
          </button>
        {:else}
          <div class="cover" aria-hidden="true">
            {#if song.coverArtUrl}
              <img src={song.coverArtUrl} alt="" />
            {:else}
              <span>{initial(song)}</span>
            {/if}
          </div>
        {/if}

        <h2 class="title" data-testid="title">{song.title}</h2>
        <p class="artist">{song.artist}</p>
        {#if meta(song)}
          <p class="meta">{meta(song)}</p>
        {/if}

        <div class="controls" data-testid="controls">
          <button
            class="ctrl"
            onclick={() => go(prev)}
            disabled={!canPrev}
            aria-label="Previous song"
            data-testid="prev"
          >
            {@render prevIcon()}
          </button>
          <button
            class="ctrl play"
            onclick={togglePlay}
            disabled={!song.previewUrl || playerError}
            aria-label={playing ? 'Pause' : 'Play'}
            data-testid="playpause"
          >
            {@render (playing ? pauseIcon : playIcon)()}
          </button>
          <button class="ctrl" onclick={() => go(next)} aria-label="Next song" data-testid="next">
            {@render nextIcon()}
          </button>
        </div>

        <ul class="links" data-testid="links">
          {#each current.links as link (link.platform)}
            <li>
              <a
                href={safeUrl(link.url)}
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
      <p class="error" role="alert" data-testid="error">{error}</p>
    {:else}
      <div class="card placeholder" aria-hidden="true">
        <div class="cover"></div>
        <div class="line wide"></div>
        <div class="line"></div>
      </div>
    {/if}
  </section>

  <audio
    bind:this={audioEl}
    src={song?.previewUrl ?? undefined}
    onplay={() => {
      playing = true;
      primed = true;
    }}
    onpause={() => (playing = false)}
    onended={() => {
      playing = false;
      // Advance on natural end of a real clip. Guard against a degenerate
      // finite-but-tiny source driving a runaway skip; a NaN/unknown duration
      // that still fired `ended` is treated as a real end (don't dead-end).
      const d = audioEl?.duration ?? 0;
      if (audioEl && (!Number.isFinite(d) || d >= 5)) next();
    }}
    onerror={onPreviewError}
    preload="metadata"
    data-testid="player-audio"
  ></audio>

  <button
    class="shuffle"
    onclick={() => go(discover)}
    disabled={loading}
    data-testid="shuffle"
    aria-label="Shuffle to a new song"
  >
    {loading ? 'Finding a song' : 'Shuffle'}
  </button>

  <p class="hint" data-testid="hint">
    <kbd>space</kbd> play · <kbd>←</kbd> <kbd>→</kbd> browse
  </p>
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

  /* Visually hidden but available to screen readers (the live status node). */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .card {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 1.75rem 1.5rem 1.5rem;
    text-align: center;
    box-shadow: 0 1px 2px rgba(20, 20, 20, 0.04);
    /* Allow vertical scroll; horizontal is our swipe-to-navigate gesture. */
    touch-action: pan-y;
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

  .cover-btn {
    appearance: none;
    padding: 0;
    position: relative;
    cursor: pointer;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fafafa;
    background: rgba(20, 20, 20, 0.28);
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .play-overlay :global(svg) {
    width: 40px;
    height: 40px;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
  }

  /* Paused: keep the play triangle visible so it reads as playable. */
  .play-overlay:not(.playing) {
    opacity: 1;
    background: rgba(20, 20, 20, 0.16);
  }

  .cover-btn:hover .play-overlay,
  .cover-btn:focus-visible .play-overlay {
    opacity: 1;
  }

  .cover-btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 3px;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.85rem;
    margin-top: 1.4rem;
  }

  .ctrl {
    appearance: none;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 999px;
    width: 2.5rem;
    height: 2.5rem;
    color: var(--ink);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      opacity 0.15s ease;
  }

  .ctrl :global(svg) {
    width: 18px;
    height: 18px;
  }

  .ctrl:hover:not(:disabled) {
    border-color: var(--ink);
    background: var(--bg);
  }

  .ctrl:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .ctrl:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .ctrl.play {
    width: 3rem;
    height: 3rem;
    background: var(--accent);
    border-color: var(--accent);
    color: #fafafa;
  }

  .ctrl.play :global(svg) {
    width: 22px;
    height: 22px;
  }

  audio {
    display: none;
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

  /* No physical keyboard on touch devices, so the space-key hint is noise. */
  @media (hover: none) and (pointer: coarse) {
    .hint {
      display: none;
    }
  }
</style>
