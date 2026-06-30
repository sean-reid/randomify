import { describe, expect, it } from 'vitest';
import { buildCorpusData } from './build-corpus.js';
import type { NormalizedRecording } from '../ingest/ingest.js';
import type { Resolution } from '../resolvers/types.js';

function rec(id: string, artistId: string): NormalizedRecording {
  return {
    recordingId: id,
    title: id,
    artistId,
    artist: artistId,
    releaseGroupId: `rg-${artistId}`,
    releaseTitle: 'RG',
    year: 1995,
    durationMs: 200000,
    isrc: `isrc-${id}`,
    country: 'GB',
    language: 'eng',
    genres: ['rock'],
  };
}

const exact = (platform: Resolution['platform']): Resolution => ({
  platform,
  url: `https://x/${platform}`,
  kind: 'exact',
  confidence: 1,
  strategy: 'fake',
});
const fallback = (platform: Resolution['platform']): Resolution => ({
  platform,
  url: `https://x/${platform}/search`,
  kind: 'search_fallback',
  confidence: 0,
  strategy: null,
});

describe('buildCorpusData', () => {
  it('keeps only recordings with an exact link and preserves the full link row', () => {
    const recordings = [rec('r1', 'a1'), rec('r2', 'a2')];
    const resolutions = new Map<string, Resolution[]>([
      ['r1', [exact('deezer'), fallback('pandora')]],
      ['r2', [fallback('deezer'), fallback('pandora')]], // no exact -> dropped
    ]);

    const corpus = buildCorpusData(recordings, resolutions);
    expect(corpus.recordings.map((r) => r.id)).toEqual(['r1']);
    expect(corpus.artists).toHaveLength(1);
    expect(corpus.links.map((l) => l.platform).sort()).toEqual(['deezer', 'pandora']);
    expect(corpus.weights.facetValues.length).toBeGreaterThan(0);
  });

  it('produces an empty corpus when nothing is streamable', () => {
    const corpus = buildCorpusData([rec('r1', 'a1')], new Map([['r1', [fallback('deezer')]]]));
    expect(corpus.recordings).toHaveLength(0);
    expect(corpus.weights.facetValues).toHaveLength(0);
  });
});
