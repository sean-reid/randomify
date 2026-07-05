<script lang="ts">
  import { fetchFacets, searchArtists } from '$lib/api';
  import { countryName, formatDecade, languageName } from '$lib/labels';
  import {
    hasFilters,
    type ArtistHit,
    type Facet,
    type FacetCatalog,
    type FacetValue,
    type SpinFilters,
  } from '@randomify/shared';

  /** Below this, the artist query stays client-side (too short to index well). */
  const MIN_ARTIST_QUERY = 2;

  let { filters, onChange }: { filters: SpinFilters; onChange: (next: SpinFilters) => void } =
    $props();

  let open = $state(false);
  let catalog = $state<FacetCatalog>({ genre: [], decade: [], country: [], language: [] });
  let facetsLoaded = $state(false);
  let openDim = $state<Facet | null>(null);
  let artistQuery = $state('');
  let artistResults = $state<ArtistHit[]>([]);
  let artistSearched = $state(false);
  // Remember names of artists chosen this session so chips read as names, not ids.
  let artistNames = $state<Record<string, string>>({});

  // Country is intentionally omitted for v1: the corpus stores raw MusicBrainz
  // area names at mixed granularity (cities and regions mixed with countries),
  // so it is not a clean facet yet. The API still accepts it; only the picker
  // hides it. genre/decade/language are clean.
  const dims: { facet: Facet; key: keyof SpinFilters; label: string }[] = [
    { facet: 'genre', key: 'genres', label: 'Genre' },
    { facet: 'decade', key: 'decades', label: 'Decade' },
    { facet: 'language', key: 'languages', label: 'Language' },
  ];

  const activeCount = $derived(
    (filters.genres?.length ?? 0) +
      (filters.decades?.length ?? 0) +
      (filters.countries?.length ?? 0) +
      (filters.languages?.length ?? 0) +
      (filters.artistIds?.length ?? 0),
  );

  /** The selected values of a dimension, as strings (decades are numbers). */
  function selectedOf(facet: Facet): string[] {
    if (facet === 'decade') return (filters.decades ?? []).map(String);
    if (facet === 'genre') return filters.genres ?? [];
    if (facet === 'country') return filters.countries ?? [];
    return filters.languages ?? [];
  }

  /** How a facet value is shown: friendly names for decade/country/language. */
  function label(facet: Facet, value: string): string {
    if (facet === 'decade') return formatDecade(value);
    if (facet === 'country') return countryName(value);
    if (facet === 'language') return languageName(value);
    return value;
  }

  /** Refetch available values whenever the active filters change (drill-down). */
  $effect(() => {
    // Reference filters so the effect re-runs when they change.
    const active = filters;
    let cancelled = false;
    void fetchFacets(active)
      .then((c) => {
        if (!cancelled) {
          catalog = c;
          facetsLoaded = true;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  /** Debounced artist typeahead, filter-aware so only matching artists show.
   * Short queries stay client-side (they can't use the trgm index well). */
  $effect(() => {
    const q = artistQuery.trim();
    const active = filters;
    if (q.length < MIN_ARTIST_QUERY) {
      artistResults = [];
      artistSearched = false;
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchArtists(q, active)
        .then((hits) => {
          if (!cancelled) {
            artistResults = hits;
            artistSearched = true;
          }
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  /** Values to show for a dimension: the drill-down set, plus any selected value
   * that dropped out of it (so it can still be removed). */
  function valuesFor(facet: Facet): FacetValue[] {
    const available = catalog[facet];
    const shownValues = new Set(available.map((v) => v.value));
    const extras = selectedOf(facet)
      .filter((v) => !shownValues.has(v))
      .map((value) => ({ value, count: 0 }));
    return [...available, ...extras];
  }

  function toggleValue(facet: Facet, value: string): void {
    const key = dims.find((d) => d.facet === facet)!.key;
    if (facet === 'decade') {
      const cur = filters.decades ?? [];
      const n = Number(value);
      const next = cur.includes(n) ? cur.filter((d) => d !== n) : [...cur, n];
      onChange({ ...filters, decades: next });
      return;
    }
    const cur = (filters[key] as string[] | undefined) ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...filters, [key]: next });
  }

  function addArtist(hit: ArtistHit): void {
    artistNames = { ...artistNames, [hit.id]: hit.name };
    const cur = filters.artistIds ?? [];
    if (!cur.includes(hit.id)) onChange({ ...filters, artistIds: [...cur, hit.id] });
    artistQuery = '';
    artistResults = [];
  }

  function removeArtist(id: string): void {
    onChange({ ...filters, artistIds: (filters.artistIds ?? []).filter((a) => a !== id) });
  }

  function clearAll(): void {
    onChange({});
    openDim = null;
  }

  /** Every active filter as a flat list of removable chips (friendly labels). */
  const chips = $derived([
    ...(filters.genres ?? []).map((v) => ({ facet: 'genre' as const, value: v, text: v })),
    ...(filters.decades ?? []).map((v) => ({
      facet: 'decade' as const,
      value: String(v),
      text: formatDecade(String(v)),
    })),
    ...(filters.countries ?? []).map((v) => ({
      facet: 'country' as const,
      value: v,
      text: countryName(v),
    })),
    ...(filters.languages ?? []).map((v) => ({
      facet: 'language' as const,
      value: v,
      text: languageName(v),
    })),
    ...(filters.artistIds ?? []).map((id) => ({
      facet: 'artist' as const,
      value: id,
      text: artistNames[id] ?? 'Artist',
    })),
  ]);

  function removeChip(facet: Facet | 'artist', value: string): void {
    if (facet === 'artist') removeArtist(value);
    else toggleValue(facet, value);
  }
</script>

<div class="filterbar" data-testid="filterbar">
  <div class="row">
    <button
      class="toggle"
      class:active={activeCount > 0}
      aria-expanded={open}
      onclick={() => (open = !open)}
      data-testid="filter-toggle"
    >
      Filter{activeCount > 0 ? ` (${activeCount})` : ''}
    </button>
    {#if hasFilters(filters)}
      <button class="clear" onclick={clearAll} data-testid="filter-clear">Clear</button>
    {/if}
  </div>

  {#if chips.length > 0}
    <ul class="chips" data-testid="filter-chips">
      {#each chips as chip (chip.facet + chip.value)}
        <li>
          <button
            class="chip"
            aria-label={`Remove ${chip.text} filter`}
            onclick={() => removeChip(chip.facet, chip.value)}
          >
            {chip.text}
            <span aria-hidden="true">×</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if open}
    <div class="panel" data-testid="filter-panel">
      <div class="dims">
        {#each dims as dim (dim.facet)}
          <div class="dim" class:open={openDim === dim.facet}>
            <button
              class="dim-toggle"
              aria-expanded={openDim === dim.facet}
              onclick={() => (openDim = openDim === dim.facet ? null : dim.facet)}
            >
              {dim.label}
              {#if selectedOf(dim.facet).length > 0}<span class="badge"
                  >{selectedOf(dim.facet).length}</span
                >{/if}
            </button>
            {#if openDim === dim.facet}
              <ul class="values" data-testid={`values-${dim.facet}`}>
                {#each valuesFor(dim.facet) as v (v.value)}
                  {@const on = selectedOf(dim.facet).includes(v.value)}
                  <li>
                    <button
                      class="value"
                      class:on
                      aria-pressed={on}
                      onclick={() => toggleValue(dim.facet, v.value)}
                    >
                      <span>{label(dim.facet, v.value)}</span>
                      {#if v.count > 0}<span class="count">{v.count}</span>{/if}
                    </button>
                  </li>
                {/each}
                {#if valuesFor(dim.facet).length === 0}
                  <li class="none">{facetsLoaded ? 'No options' : 'Loading…'}</li>
                {/if}
              </ul>
            {/if}
          </div>
        {/each}
      </div>

      <div class="artist">
        <input
          type="search"
          placeholder="Search artist"
          bind:value={artistQuery}
          aria-label="Search artist to filter by"
          data-testid="artist-search"
        />
        {#if artistResults.length > 0}
          <ul class="values" data-testid="artist-results">
            {#each artistResults as hit (hit.id)}
              <li>
                <button class="value" onclick={() => addArtist(hit)}>{hit.name}</button>
              </li>
            {/each}
          </ul>
        {:else if artistSearched}
          <p class="none">No artists found</p>
        {/if}
        <p class="sr-only" role="status">
          {artistSearched ? `${artistResults.length} artists found` : ''}
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .filterbar {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .toggle,
  .clear {
    appearance: none;
    background: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--ink);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }
  .toggle:hover,
  .clear:hover {
    border-color: var(--ink);
  }
  .toggle.active {
    border-color: var(--ink);
    background: var(--bg);
  }
  .clear {
    color: var(--ink-soft);
  }

  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
  }
  .chip {
    appearance: none;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    color: var(--ink);
    cursor: pointer;
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
  }
  .chip:hover {
    border-color: var(--ink);
  }

  .panel {
    width: 100%;
    max-width: 30rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .dims {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .dim {
    flex: 1 1 auto;
  }
  /* An open dimension takes the full panel width so its value list is not
     cramped into a half-width column. */
  .dim.open {
    flex-basis: 100%;
  }

  /* Match the app's focus ring on every control for keyboard parity. */
  .toggle:focus-visible,
  .clear:focus-visible,
  .chip:focus-visible,
  .dim-toggle:focus-visible,
  .value:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }

  /* Comfortable touch targets on coarse pointers (the value rows sit in a
     scroll list where mistaps are easy). */
  @media (pointer: coarse) {
    .toggle,
    .clear,
    .chip,
    .dim-toggle,
    .value {
      min-height: 44px;
    }
  }
  .dim-toggle {
    appearance: none;
    width: 100%;
    background: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--ink);
    cursor: pointer;
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    align-items: center;
  }
  .badge {
    background: var(--accent);
    color: #fafafa;
    border-radius: 999px;
    font-size: 0.7rem;
    padding: 0 0.4rem;
    line-height: 1.4;
  }

  .values {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    max-height: 12rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .value {
    appearance: none;
    width: 100%;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--ink);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
  }
  .value:hover {
    background: var(--bg);
  }
  .value.on {
    background: var(--accent);
    color: #fafafa;
  }
  .count {
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .value.on .count {
    color: #d8d8d8;
  }
  .none {
    color: var(--ink-soft);
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
  }

  .artist input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--ink);
    background: var(--bg);
  }
  .artist input:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
