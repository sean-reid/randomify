import type { StreamableRecording } from './weights.js';

/** Keep genre lists to the same size the release-group tagger produces (top 3). */
const MAX_GENRES = 3;

/**
 * Fill sparse recording-level facets so strict filtering has usable coverage,
 * using only signal already in the corpus. Pure: returns a new array, inputs
 * untouched.
 *
 * - genre: recording.genres comes from release-group tags and is often empty.
 *   Backfill an empty list from the artist's most common genres (across their
 *   other release groups). Coarser than a per-release tag, but a large coverage
 *   win.
 * - language: release language is patchy. Backfill a null from the release
 *   group's modal language, then the artist's modal language.
 *
 * decade (release-group year) and country (artist area) are already propagated
 * upstream; a still-missing value stays null and simply never matches that
 * filter, which is the correct strict behavior.
 */
export function backfill(recordings: readonly StreamableRecording[]): StreamableRecording[] {
  const artistGenreFreq = new Map<string, Map<string, number>>();
  const rgLangFreq = new Map<string, Map<string, number>>();
  const artistLangFreq = new Map<string, Map<string, number>>();

  const bump = (outer: Map<string, Map<string, number>>, key: string, value: string): void => {
    const inner = outer.get(key) ?? new Map<string, number>();
    inner.set(value, (inner.get(value) ?? 0) + 1);
    outer.set(key, inner);
  };

  for (const rec of recordings) {
    for (const g of rec.genres) bump(artistGenreFreq, rec.artistId, g);
    if (rec.language) {
      bump(rgLangFreq, rec.releaseGroupId, rec.language);
      bump(artistLangFreq, rec.artistId, rec.language);
    }
  }

  const topGenres = (artistId: string): string[] =>
    [...(artistGenreFreq.get(artistId)?.entries() ?? [])]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, MAX_GENRES)
      .map(([genre]) => genre);

  const mode = (freq: Map<string, number> | undefined): string | null => {
    if (!freq) return null;
    let best: string | null = null;
    let bestCount = 0;
    for (const [value, count] of freq) {
      if (count > bestCount || (count === bestCount && best !== null && value < best)) {
        best = value;
        bestCount = count;
      }
    }
    return best;
  };

  return recordings.map((rec) => {
    const genres = rec.genres.length > 0 ? rec.genres : topGenres(rec.artistId);
    const language =
      rec.language ??
      mode(rgLangFreq.get(rec.releaseGroupId)) ??
      mode(artistLangFreq.get(rec.artistId));
    return { ...rec, genres, language };
  });
}
