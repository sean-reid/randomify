import { DEFAULT_ALPHA, temperedWeight, type Facet } from '@randomify/shared';
import type { StreamableRecording } from './weights.js';
import { backfill } from './backfill.js';

/** Release-group year to its integer decade (e.g. 1987 -> 1980); null if unknown. */
export function decadeOf(year: number | null): number | null {
  return year == null ? null : Math.floor(year / 10) * 10;
}

/** One row of the denormalized filtered-sampling index (`sample_recording`). */
export interface SampleRecordingRow {
  recordingId: string;
  artistId: string;
  /** Filter-independent draw weight (see below); used by the weighted filtered spin. */
  weight: number;
  decade: number | null;
  country: string | null;
  language: string | null;
  genres: string[];
}

/** One row of the materialized unfiltered facet catalog (`facet_catalog`). */
export interface FacetCatalogRow {
  dimension: Facet;
  value: string;
  count: number;
}

/**
 * Per-recording weights for the filtered draw. A single flat weight cannot
 * reproduce the four-level facet walk, and it should not try to: once a user
 * has fixed the facet values, the walk's facet-entry weighting is meaningless.
 * Instead we mirror the artist -> release-group -> recording sub-walk, which is
 * fully precomputable and filter-independent:
 *
 *   weight(rec) = artistCount^a * rgCount^a / S_artist * (1 / rgCount)
 *
 * where S_artist = sum over the artist's release groups of rgCount^a. This makes
 * the total weight of every artist exactly artistCount^a (so a 500-track artist
 * does not swamp a 2-track artist any more than in the real walk), tempers
 * release groups within an artist, and stays uniform within a release group.
 * A deliberate approximation of the hierarchical distribution.
 */
export function buildSampleRows(
  recordings: readonly StreamableRecording[],
  alpha: number = DEFAULT_ALPHA,
): SampleRecordingRow[] {
  const artistCount = new Map<string, number>();
  const rgCount = new Map<string, number>();
  const artistRgs = new Map<string, Set<string>>();

  for (const rec of recordings) {
    artistCount.set(rec.artistId, (artistCount.get(rec.artistId) ?? 0) + 1);
    rgCount.set(rec.releaseGroupId, (rgCount.get(rec.releaseGroupId) ?? 0) + 1);
    const rgs = artistRgs.get(rec.artistId) ?? new Set<string>();
    rgs.add(rec.releaseGroupId);
    artistRgs.set(rec.artistId, rgs);
  }

  // S_artist: the normalizer that keeps each artist's total weight = count^alpha.
  const sArtist = new Map<string, number>();
  for (const [artistId, rgs] of artistRgs) {
    let s = 0;
    for (const rg of rgs) s += temperedWeight(rgCount.get(rg)!, alpha);
    sArtist.set(artistId, s);
  }

  return recordings.map((rec) => {
    const a = temperedWeight(artistCount.get(rec.artistId)!, alpha);
    const rg = rgCount.get(rec.releaseGroupId)!;
    const weight = (a * temperedWeight(rg, alpha)) / (sArtist.get(rec.artistId)! * rg);
    return {
      recordingId: rec.recordingId,
      artistId: rec.artistId,
      weight,
      decade: rec.decade,
      country: rec.country,
      language: rec.language,
      genres: rec.genres,
    };
  });
}

/**
 * The unfiltered facet catalog: every facet value and how many recordings carry
 * it. Serves the no-filter /facets call as a plain table read. Genre is
 * multi-valued per recording; the scalar dimensions contribute at most one value.
 */
export function buildFacetCatalog(rows: readonly SampleRecordingRow[]): FacetCatalogRow[] {
  const counts = new Map<Facet, Map<string, number>>([
    ['genre', new Map()],
    ['decade', new Map()],
    ['country', new Map()],
    ['language', new Map()],
  ]);
  const bump = (dim: Facet, value: string): void => {
    const m = counts.get(dim)!;
    m.set(value, (m.get(value) ?? 0) + 1);
  };

  for (const row of rows) {
    for (const g of row.genres) bump('genre', g);
    if (row.decade != null) bump('decade', String(row.decade));
    if (row.country) bump('country', row.country);
    if (row.language) bump('language', row.language);
  }

  const catalog: FacetCatalogRow[] = [];
  for (const [dimension, values] of counts) {
    for (const [value, count] of values) catalog.push({ dimension, value, count });
  }
  return catalog;
}

/**
 * Build the strict-filter serving tables from the streamable set: backfill sparse
 * facets, then derive the per-recording sample rows and the unfiltered facet
 * catalog. The one place both corpus entry points (build-corpus, rebuild-weights)
 * assemble these, so the backfill-then-sample sequence cannot drift between them.
 * The unfiltered prefix-sum walk deliberately keeps the original (un-backfilled)
 * facets, so weights are still built from the raw streamable set, not here.
 */
export function buildDerivedTables(recordings: readonly StreamableRecording[]): {
  sampleRecordings: SampleRecordingRow[];
  facetCatalog: FacetCatalogRow[];
} {
  const sampleRecordings = buildSampleRows(backfill(recordings));
  return { sampleRecordings, facetCatalog: buildFacetCatalog(sampleRecordings) };
}
