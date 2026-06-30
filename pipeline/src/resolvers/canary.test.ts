import { describe, expect, it } from 'vitest';
import { checkCanary, type GoldenEntry } from './canary.js';

const golden: GoldenEntry[] = [
  {
    isrc: 'GBAYE6700477',
    title: 'Paranoid Android',
    artist: 'Radiohead',
    expected: {
      spotify: 'https://open.spotify.com/track/correct',
      deezer: 'https://www.deezer.com/track/correct',
    },
  },
];

describe('checkCanary', () => {
  it('passes when every resolved url matches', () => {
    const summary = checkCanary(golden, (_isrc, platform) =>
      platform === 'spotify'
        ? 'https://open.spotify.com/track/correct'
        : 'https://www.deezer.com/track/correct',
    );
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failures).toHaveLength(0);
  });

  it('reports a failure when a url drifts', () => {
    const summary = checkCanary(golden, (_isrc, platform) =>
      platform === 'spotify' ? 'https://open.spotify.com/track/WRONG' : null,
    );
    expect(summary.passed).toBe(0);
    expect(summary.failures).toHaveLength(2);
    expect(summary.byPlatform.spotify).toEqual({ total: 1, passed: 0 });
  });
});
