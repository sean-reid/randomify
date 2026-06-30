import type { NormalizedRecording } from '../ingest/ingest.js';

/**
 * Order recordings for the resolver backlog. The goals, in order:
 *
 * 1. ISRC first - recordings with an ISRC resolve far more reliably.
 * 2. Breadth across the hierarchy - round-robin across artists so early
 *    resolution spreads over many artists rather than draining one catalog.
 * 3. Recent-but-not-only - a mild lean toward newer recordings as a tiebreak,
 *    without starving older eras.
 */
export function prioritize(recordings: readonly NormalizedRecording[]): NormalizedRecording[] {
  // Round-robin rank: the Nth recording of its artist gets rank N, so every
  // artist's first recording precedes any artist's second.
  const seenPerArtist = new Map<string, number>();
  const ranked = recordings.map((recording) => {
    const rank = seenPerArtist.get(recording.artistId) ?? 0;
    seenPerArtist.set(recording.artistId, rank + 1);
    return { recording, rank };
  });

  return ranked
    .sort((a, b) => {
      const isrc = hasIsrc(b.recording) - hasIsrc(a.recording);
      if (isrc !== 0) return isrc;
      if (a.rank !== b.rank) return a.rank - b.rank;
      const recency = (b.recording.year ?? 0) - (a.recording.year ?? 0);
      if (recency !== 0) return recency;
      return a.recording.recordingId < b.recording.recordingId ? -1 : 1;
    })
    .map((entry) => entry.recording);
}

function hasIsrc(recording: NormalizedRecording): number {
  return recording.isrc ? 1 : 0;
}
