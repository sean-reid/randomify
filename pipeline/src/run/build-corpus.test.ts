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

  it('attaches preview and cover art from the exact link, preferring deezer', () => {
    const tidal: Resolution = { ...exact('tidal'), previewUrl: 'https://t/mp3' };
    const deezer: Resolution = {
      ...exact('deezer'),
      previewUrl: 'https://d/mp3',
      coverArtUrl: 'https://d/jpg',
    };
    const corpus = buildCorpusData([rec('r1', 'a1')], new Map([['r1', [tidal, deezer]]]));
    expect(corpus.recordings[0]).toMatchObject({
      previewUrl: 'https://d/mp3',
      coverArtUrl: 'https://d/jpg',
    });
  });

  it('leaves preview and cover null when no exact link carries them', () => {
    const corpus = buildCorpusData([rec('r1', 'a1')], new Map([['r1', [exact('deezer')]]]));
    expect(corpus.recordings[0]?.previewUrl).toBeNull();
    expect(corpus.recordings[0]?.coverArtUrl).toBeNull();
  });

  it('fills year from the exact link when MusicBrainz has none, but MB year wins', () => {
    const noYear = { ...rec('r1', 'a1'), year: null };
    const withYear = { ...rec('r2', 'a2'), year: 1995 };
    const resolutions = new Map<string, Resolution[]>([
      ['r1', [{ ...exact('deezer'), year: 1997 }]],
      ['r2', [{ ...exact('deezer'), year: 2000 }]],
    ]);
    const corpus = buildCorpusData([noYear, withYear], resolutions);
    expect(corpus.recordings.find((r) => r.id === 'r1')?.year).toBe(1997); // filled from Deezer
    expect(corpus.recordings.find((r) => r.id === 'r2')?.year).toBe(1995); // MB year preserved
  });

  it('drops a recording found only on a non-Deezer platform', () => {
    const corpus = buildCorpusData(
      [rec('r1', 'a1')],
      new Map([['r1', [exact('tidal'), fallback('deezer')]]]),
    );
    expect(corpus.recordings).toHaveLength(0);
  });

  it('produces an empty corpus when nothing is streamable', () => {
    const corpus = buildCorpusData([rec('r1', 'a1')], new Map([['r1', [fallback('deezer')]]]));
    expect(corpus.recordings).toHaveLength(0);
    expect(corpus.weights.facetValues).toHaveLength(0);
  });
});
