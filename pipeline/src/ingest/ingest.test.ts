import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ingest, type NormalizedRecording } from './ingest.js';

const SAMPLE_DIR = fileURLToPath(new URL('../../fixtures/mb-sample', import.meta.url));

function byId(rows: NormalizedRecording[]): Map<string, NormalizedRecording> {
  return new Map(rows.map((r) => [r.recordingId, r]));
}

describe('ingest', () => {
  it('normalizes the hierarchy with isrc, genres, year, country, and language', async () => {
    const rows = await ingest(SAMPLE_DIR);
    expect(rows).toHaveLength(4);

    const paranoid = byId(rows).get('rec-gid-paranoid')!;
    expect(paranoid).toMatchObject({
      title: 'Paranoid Android',
      artist: 'Radiohead',
      artistId: 'artist-gid-radiohead',
      releaseGroupId: 'rg-gid-okcomputer',
      releaseTitle: 'OK Computer',
      year: 1997,
      durationMs: 383000,
      isrc: 'GBAYE6700477',
      country: 'GB',
      language: 'eng',
    });
    expect([...paranoid.genres].sort()).toEqual(['alternative', 'rock']);
  });

  it('keeps recordings without an ISRC, with a null isrc', async () => {
    const jolene = byId(await ingest(SAMPLE_DIR)).get('rec-gid-jolene')!;
    expect(jolene.isrc).toBeNull();
    expect(jolene.genres).toEqual(['country']);
  });

  it('preserves unicode in names', async () => {
    const corcovado = byId(await ingest(SAMPLE_DIR)).get('rec-gid-corcovado')!;
    expect(corcovado.artist).toBe('Antônio Carlos Jobim');
    expect(corcovado.language).toBe('por');
  });
});
