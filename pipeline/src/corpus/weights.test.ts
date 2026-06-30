import { describe, expect, it } from 'vitest';
import { buildWeights, type StreamableRecording } from './weights.js';

const RECORDINGS: StreamableRecording[] = [
  {
    recordingId: 'r-a1',
    artistId: 'a1',
    releaseGroupId: 'rg1',
    genres: ['rock'],
    decade: '1990s',
    country: 'GB',
    language: 'eng',
  },
  {
    recordingId: 'r-a2',
    artistId: 'a1',
    releaseGroupId: 'rg1',
    genres: ['rock', 'alternative'],
    decade: '1990s',
    country: 'GB',
    language: 'eng',
  },
  {
    recordingId: 'r-a3',
    artistId: 'a2',
    releaseGroupId: 'rg2',
    genres: ['rock'],
    decade: '2000s',
    country: 'US',
    language: 'eng',
  },
];

describe('buildWeights', () => {
  const w = buildWeights(RECORDINGS);

  it('counts a multi-genre recording toward each genre', () => {
    const rock = w.facetValues.find((f) => f.facetType === 'genre' && f.facetId === 'rock')!;
    const alt = w.facetValues.find((f) => f.facetType === 'genre' && f.facetId === 'alternative')!;
    // rock appears on all three recordings, alternative on one.
    expect(rock.weight).toBeCloseTo(Math.pow(3, 0.4), 5);
    expect(alt.weight).toBeCloseTo(1, 5);
  });

  it('keeps cum_weight monotonic and ending at the partition total per facet type', () => {
    for (const facetType of ['genre', 'decade', 'country', 'language'] as const) {
      const rows = w.facetValues.filter((f) => f.facetType === facetType);
      const total = rows.reduce((sum, r) => sum + r.weight, 0);
      let prev = 0;
      for (const r of rows) {
        expect(r.cumWeight).toBeGreaterThan(prev);
        prev = r.cumWeight;
      }
      expect(rows[rows.length - 1]!.cumWeight).toBeCloseTo(total, 5);
    }
  });

  it('partitions artist weights within a facet value with its own prefix sum', () => {
    const rockArtists = w.facetArtists
      .filter((f) => f.facetType === 'genre' && f.facetId === 'rock')
      .sort((a, b) => a.cumWeight - b.cumWeight);
    expect(rockArtists.map((a) => a.artistId)).toEqual(['a1', 'a2']);
    // a1 has 2 rock recordings, a2 has 1.
    expect(rockArtists[0]!.weight).toBeCloseTo(Math.pow(2, 0.4), 5);
    expect(rockArtists[1]!.weight).toBeCloseTo(1, 5);
    expect(rockArtists[1]!.cumWeight).toBeCloseTo(Math.pow(2, 0.4) + 1, 5);
  });

  it('numbers recordings within a release group sequentially', () => {
    const rg1 = w.releaseGroupRecordings
      .filter((r) => r.releaseGroupId === 'rg1')
      .sort((a, b) => a.cumIndex - b.cumIndex);
    expect(rg1.map((r) => r.cumIndex)).toEqual([1, 2]);
    expect(new Set(rg1.map((r) => r.recordingId))).toEqual(new Set(['r-a1', 'r-a2']));
  });
});
