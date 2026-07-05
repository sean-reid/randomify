import { describe, expect, it } from 'vitest';
import { backfill } from './backfill.js';
import type { StreamableRecording } from './weights.js';

const REC = (
  id: string,
  artistId: string,
  releaseGroupId: string,
  extra: Partial<StreamableRecording> = {},
): StreamableRecording => ({
  recordingId: id,
  artistId,
  releaseGroupId,
  genres: [],
  decade: null,
  country: null,
  language: null,
  ...extra,
});

describe('backfill', () => {
  it('fills empty genres from the artist modal genres', () => {
    const out = backfill([
      REC('r1', 'a1', 'rg1', { genres: ['rock', 'indie'] }),
      REC('r2', 'a1', 'rg2', { genres: ['rock'] }),
      REC('r3', 'a1', 'rg3', { genres: [] }), // gap -> artist mode
    ]);
    expect(out.find((r) => r.recordingId === 'r3')!.genres).toEqual(['rock', 'indie']);
    // A recording that already had genres is left as-is.
    expect(out.find((r) => r.recordingId === 'r1')!.genres).toEqual(['rock', 'indie']);
  });

  it('fills a null language from the release group, then the artist', () => {
    const out = backfill([
      REC('r1', 'a1', 'rg1', { language: 'fra' }),
      REC('r2', 'a1', 'rg1', { language: null }), // -> rg1 mode = fra
      REC('r3', 'a1', 'rg2', { language: null }), // rg2 has none -> artist mode = fra
    ]);
    expect(out.find((r) => r.recordingId === 'r2')!.language).toBe('fra');
    expect(out.find((r) => r.recordingId === 'r3')!.language).toBe('fra');
  });

  it('leaves genres/language missing when there is no signal', () => {
    const out = backfill([REC('r1', 'a1', 'rg1', { genres: [], language: null })]);
    expect(out[0]!.genres).toEqual([]);
    expect(out[0]!.language).toBeNull();
  });

  it('does not touch decade or country, and does not mutate the input', () => {
    const input = [REC('r1', 'a1', 'rg1', { decade: 1980, country: 'US', genres: [] })];
    const out = backfill(input);
    expect(out[0]!.decade).toBe(1980);
    expect(out[0]!.country).toBe('US');
    expect(input[0]!.genres).toEqual([]); // input untouched
    expect(out[0]).not.toBe(input[0]);
  });
});
