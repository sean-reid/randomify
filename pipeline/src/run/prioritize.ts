import type { NormalizedRecording } from '../ingest/ingest.js';

/**
 * Order recordings for the resolver backlog. The goals, in order:
 *
 * 1. ISRC first - recordings with an ISRC resolve far more reliably.
 * 2. Breadth across artists - round-robin so early resolution spreads over many
 *    artists rather than draining one catalog.
 * 3. Breadth across eras - within an artist-rank, round-robin across decades.
 *    A load resolves only the top of the backlog, so a pure recency lean
 *    collapses the whole resolved set onto the newest releases (a dead decade
 *    facet). Interleaving decades keeps every era represented up to its
 *    availability in the dump.
 */
export function prioritize(recordings: readonly NormalizedRecording[]): NormalizedRecording[] {
  // Round-robin ranks: the Nth recording seen for its artist (and, separately,
  // for its decade) gets rank N, so the first of every artist/decade precedes
  // any second.
  const seenPerArtist = new Map<string, number>();
  const seenPerDecade = new Map<string, number>();
  const ranked = recordings.map((recording) => {
    const artistRank = seenPerArtist.get(recording.artistId) ?? 0;
    seenPerArtist.set(recording.artistId, artistRank + 1);
    const decade = decadeKey(recording.year);
    const decadeRank = seenPerDecade.get(decade) ?? 0;
    seenPerDecade.set(decade, decadeRank + 1);
    return { recording, artistRank, decadeRank };
  });

  return ranked
    .sort((a, b) => {
      const isrc = hasIsrc(b.recording) - hasIsrc(a.recording);
      if (isrc !== 0) return isrc;
      if (a.artistRank !== b.artistRank) return a.artistRank - b.artistRank;
      if (a.decadeRank !== b.decadeRank) return a.decadeRank - b.decadeRank;
      return a.recording.recordingId < b.recording.recordingId ? -1 : 1;
    })
    .map((entry) => entry.recording);
}

function decadeKey(year: number | null): string {
  return year == null ? 'unknown' : String(Math.floor(year / 10) * 10);
}

function hasIsrc(recording: NormalizedRecording): number {
  return recording.isrc ? 1 : 0;
}
