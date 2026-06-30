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
  url: platform === 'deezer' ? 'https://www.deezer.com/track/123' : `https://x/${platform}`,
  kind: 'exact',
  confidence: 1,
  strategy: 'fake',
  // A Deezer match needs a preview to be kept, so the helper carries one by default.
  ...(platform === 'deezer' ? { previewUrl: 'https://cdnt-preview.dzcdn.net/x.mp3' } : {}),
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

  it('stores the stable proxy path and cover art from the Deezer exact link', () => {
    const tidal: Resolution = { ...exact('tidal'), previewUrl: 'https://t/mp3' };
    const deezer: Resolution = {
      ...exact('deezer'),
      previewUrl: 'https://cdnt-preview.dzcdn.net/whatever.mp3?hdnea=exp=1~hmac=2',
      coverArtUrl: 'https://d/jpg',
    };
    const corpus = buildCorpusData([rec('r1', 'a1')], new Map([['r1', [tidal, deezer]]]));
    expect(corpus.recordings[0]).toMatchObject({
      previewUrl: '/preview/123', // ephemeral URL replaced by the stable proxy path
      coverArtUrl: 'https://d/jpg',
    });
  });

  it('drops a Deezer match that has no preview', () => {
    const corpus = buildCorpusData(
      [rec('r1', 'a1')],
      new Map([['r1', [{ ...exact('deezer'), previewUrl: null }]]]),
    );
    expect(corpus.recordings).toHaveLength(0);
  });

  it('keeps a song with a preview but no cover art (cover null)', () => {
    const corpus = buildCorpusData(
      [rec('r1', 'a1')],
      new Map([['r1', [{ ...exact('deezer'), coverArtUrl: null }]]]),
    );
    expect(corpus.recordings).toHaveLength(1);
    expect(corpus.recordings[0]?.coverArtUrl).toBeNull();
    expect(corpus.recordings[0]?.previewUrl).toBe('/preview/123');
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

  it('upgrades a search-fallback link to exact when MB has the streaming URL', () => {
    const rec1 = {
      ...rec('r1', 'a1'),
      streamingLinks: { spotify: 'https://open.spotify.com/track/x' },
    };
    const corpus = buildCorpusData(
      [rec1],
      new Map([['r1', [exact('deezer'), fallback('spotify'), fallback('tidal')]]]),
    );
    const byPlatform = new Map(corpus.links.map((l) => [l.platform, l]));
    expect(byPlatform.get('spotify')).toMatchObject({
      url: 'https://open.spotify.com/track/x',
      kind: 'exact',
    });
    // A platform MB has no link for keeps its search fallback.
    expect(byPlatform.get('tidal')?.kind).toBe('search_fallback');
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
