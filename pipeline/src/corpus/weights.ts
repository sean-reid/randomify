import { DEFAULT_ALPHA, temperedWeight, type Facet } from '@randomify/shared';

/** A recording that resolved to at least one streaming link, with its facets. */
export interface StreamableRecording {
  recordingId: string;
  artistId: string;
  releaseGroupId: string;
  genres: string[];
  decade: string | null;
  country: string | null;
  language: string | null;
}

export interface FacetValueRow {
  facetType: Facet;
  facetId: string;
  weight: number;
  cumWeight: number;
}

export interface FacetArtistRow {
  facetType: Facet;
  facetId: string;
  artistId: string;
  weight: number;
  cumWeight: number;
}

export interface ArtistReleaseGroupRow {
  artistId: string;
  releaseGroupId: string;
  weight: number;
  cumWeight: number;
}

export interface ReleaseGroupRecordingRow {
  releaseGroupId: string;
  recordingId: string;
  cumIndex: number;
}

export interface CorpusWeights {
  facetValues: FacetValueRow[];
  facetArtists: FacetArtistRow[];
  artistReleaseGroups: ArtistReleaseGroupRow[];
  releaseGroupRecordings: ReleaseGroupRecordingRow[];
}

const FACET_TYPES: Facet[] = ['genre', 'decade', 'country', 'language'];

/** The facet values a recording belongs to for a given facet (may be empty). */
function facetIdsFor(recording: StreamableRecording, facet: Facet): string[] {
  switch (facet) {
    case 'genre':
      return recording.genres;
    case 'decade':
      return recording.decade ? [recording.decade] : [];
    case 'country':
      return recording.country ? [recording.country] : [];
    case 'language':
      return recording.language ? [recording.language] : [];
  }
}

/** Increment a counter keyed by string. */
function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Tempered weight, with the shared alpha by default. */
function weightOf(count: number, alpha: number): number {
  return temperedWeight(count, alpha);
}

/**
 * Build the prefix-sum weight index the sampler walks: facet value, then artist
 * within a facet value, then release group within an artist, then recording
 * within a release group. Every level is weighted by tempered subtree size so
 * the served distribution matches the in-memory sampler core.
 */
export function buildWeights(
  recordings: readonly StreamableRecording[],
  alpha: number = DEFAULT_ALPHA,
): CorpusWeights {
  // facet value -> count, and (facet value -> artist -> count)
  const facetCounts = new Map<Facet, Map<string, number>>();
  const facetArtistCounts = new Map<Facet, Map<string, Map<string, number>>>();
  const artistRgCounts = new Map<string, Map<string, number>>();
  const rgRecordings = new Map<string, string[]>();

  for (const facet of FACET_TYPES) {
    facetCounts.set(facet, new Map());
    facetArtistCounts.set(facet, new Map());
  }

  for (const rec of recordings) {
    for (const facet of FACET_TYPES) {
      const facetMap = facetCounts.get(facet)!;
      const artistMap = facetArtistCounts.get(facet)!;
      for (const facetId of facetIdsFor(rec, facet)) {
        bump(facetMap, facetId);
        const perArtist = artistMap.get(facetId) ?? new Map<string, number>();
        bump(perArtist, rec.artistId);
        artistMap.set(facetId, perArtist);
      }
    }
    const rgMap = artistRgCounts.get(rec.artistId) ?? new Map<string, number>();
    bump(rgMap, rec.releaseGroupId);
    artistRgCounts.set(rec.artistId, rgMap);

    const recs = rgRecordings.get(rec.releaseGroupId) ?? [];
    recs.push(rec.recordingId);
    rgRecordings.set(rec.releaseGroupId, recs);
  }

  const facetValues: FacetValueRow[] = [];
  for (const facet of FACET_TYPES) {
    let cum = 0;
    for (const [facetId, count] of sortedEntries(facetCounts.get(facet)!)) {
      const weight = weightOf(count, alpha);
      cum += weight;
      facetValues.push({ facetType: facet, facetId, weight, cumWeight: cum });
    }
  }

  const facetArtists: FacetArtistRow[] = [];
  for (const facet of FACET_TYPES) {
    for (const [facetId, perArtist] of sortedMapEntries(facetArtistCounts.get(facet)!)) {
      let cum = 0;
      for (const [artistId, count] of sortedEntries(perArtist)) {
        const weight = weightOf(count, alpha);
        cum += weight;
        facetArtists.push({ facetType: facet, facetId, artistId, weight, cumWeight: cum });
      }
    }
  }

  const artistReleaseGroups: ArtistReleaseGroupRow[] = [];
  for (const [artistId, rgMap] of sortedMapEntries(artistRgCounts)) {
    let cum = 0;
    for (const [releaseGroupId, count] of sortedEntries(rgMap)) {
      const weight = weightOf(count, alpha);
      cum += weight;
      artistReleaseGroups.push({ artistId, releaseGroupId, weight, cumWeight: cum });
    }
  }

  const releaseGroupRecordings: ReleaseGroupRecordingRow[] = [];
  for (const [releaseGroupId, recs] of sortedMapEntries(rgRecordings)) {
    recs.sort();
    recs.forEach((recordingId, index) => {
      releaseGroupRecordings.push({ releaseGroupId, recordingId, cumIndex: index + 1 });
    });
  }

  return { facetValues, facetArtists, artistReleaseGroups, releaseGroupRecordings };
}

function sortedEntries(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function sortedMapEntries<V>(map: Map<string, V>): [string, V][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
