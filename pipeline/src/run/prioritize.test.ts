import { describe, expect, it } from 'vitest';
import { prioritize } from './prioritize.js';
import type { NormalizedRecording } from '../ingest/ingest.js';

function rec(
  partial: Partial<NormalizedRecording> & { recordingId: string; artistId: string },
): NormalizedRecording {
  return {
    title: partial.recordingId,
    releaseGroupId: 'rg',
    releaseTitle: 'RG',
    artist: partial.artistId,
    year: null,
    durationMs: null,
    isrc: null,
    country: null,
    language: null,
    genres: [],
    ...partial,
  };
}

describe('prioritize', () => {
  it('puts recordings with an ISRC first', () => {
    const ordered = prioritize([
      rec({ recordingId: 'noisrc', artistId: 'a1' }),
      rec({ recordingId: 'hasisrc', artistId: 'a2', isrc: 'X' }),
    ]);
    expect(ordered[0]!.recordingId).toBe('hasisrc');
  });

  it('round-robins across artists for breadth', () => {
    const ordered = prioritize([
      rec({ recordingId: 'a1-1', artistId: 'a1', isrc: 'I' }),
      rec({ recordingId: 'a1-2', artistId: 'a1', isrc: 'I' }),
      rec({ recordingId: 'a2-1', artistId: 'a2', isrc: 'I' }),
    ]);
    // Each artist's first recording comes before any artist's second.
    expect(
      ordered
        .slice(0, 2)
        .map((r) => r.artistId)
        .sort(),
    ).toEqual(['a1', 'a2']);
    expect(ordered[2]!.recordingId).toBe('a1-2');
  });

  it('round-robins across decades so a truncated load spans eras', () => {
    const ordered = prioritize([
      rec({ recordingId: 'r2020a', artistId: 'a1', isrc: 'I', year: 2021 }),
      rec({ recordingId: 'r2020b', artistId: 'a2', isrc: 'I', year: 2022 }),
      rec({ recordingId: 'r1980', artistId: 'a3', isrc: 'I', year: 1985 }),
    ]);
    // The first two pulls cover two different decades (one 2020s + the 1980s)
    // rather than both 2020s; the second 2020s recording sorts last.
    const topDecades = ordered.slice(0, 2).map((r) => Math.floor((r.year ?? 0) / 10) * 10);
    expect(new Set(topDecades)).toEqual(new Set([2020, 1980]));
    expect(ordered[2]!.recordingId).toMatch(/^r2020/);
  });
});
