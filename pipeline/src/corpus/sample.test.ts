import { describe, expect, it } from 'vitest';
import { DEFAULT_ALPHA, temperedWeight } from '@randomify/shared';
import { buildFacetCatalog, buildSampleRows } from './sample.js';
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

describe('buildSampleRows', () => {
  const recs: StreamableRecording[] = [
    REC('r1', 'a1', 'rg1', { genres: ['rock'], decade: 1990, country: 'GB', language: 'eng' }),
    REC('r2', 'a1', 'rg1', { genres: ['rock'], decade: 1990, country: 'GB', language: 'eng' }),
    REC('r3', 'a1', 'rg2', { genres: ['pop'], decade: 2000, country: 'GB', language: 'eng' }),
    REC('r4', 'a2', 'rg3', { genres: ['jazz'], decade: 1970, country: 'US', language: 'eng' }),
  ];
  const rows = buildSampleRows(recs);

  it('emits one row per recording, carrying the facets through', () => {
    expect(rows).toHaveLength(4);
    const r1 = rows.find((r) => r.recordingId === 'r1')!;
    expect(r1).toMatchObject({ artistId: 'a1', decade: 1990, country: 'GB', language: 'eng' });
    expect(r1.genres).toEqual(['rock']);
    expect(r1.weight).toBeGreaterThan(0);
  });

  it('gives each artist total weight equal to its recording count tempered', () => {
    // Total weight per artist must equal artistCount^alpha regardless of how the
    // recordings split across release groups (the normalizer S_artist).
    const totalFor = (artistId: string): number =>
      rows.filter((r) => r.artistId === artistId).reduce((sum, r) => sum + r.weight, 0);
    expect(totalFor('a1')).toBeCloseTo(temperedWeight(3, DEFAULT_ALPHA), 10);
    expect(totalFor('a2')).toBeCloseTo(temperedWeight(1, DEFAULT_ALPHA), 10);
  });
});

describe('buildFacetCatalog', () => {
  it('counts every facet value across recordings', () => {
    const rows = buildSampleRows([
      REC('r1', 'a1', 'rg1', { genres: ['rock', 'pop'], decade: 1990, country: 'GB' }),
      REC('r2', 'a2', 'rg2', { genres: ['rock'], decade: 1990, language: 'eng' }),
    ]);
    const catalog = buildFacetCatalog(rows);
    const find = (dimension: string, value: string): number =>
      catalog.find((c) => c.dimension === dimension && c.value === value)?.count ?? 0;

    expect(find('genre', 'rock')).toBe(2);
    expect(find('genre', 'pop')).toBe(1);
    expect(find('decade', '1990')).toBe(2);
    expect(find('country', 'GB')).toBe(1);
    expect(find('language', 'eng')).toBe(1);
    // A null facet contributes nothing.
    expect(catalog.some((c) => c.value === 'null')).toBe(false);
  });
});
