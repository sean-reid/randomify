import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractMusicBrainz } from './musicbrainz.js';

const DUMP_DIR = fileURLToPath(new URL('../../fixtures/mbdump', import.meta.url));

describe('extractMusicBrainz', () => {
  it('extracts ISRC-bearing recordings, joined to artist, release group, year, country, language, genres', async () => {
    const rows = await extractMusicBrainz(DUMP_DIR);

    // Only the ISRC-bearing recording survives; the one without an ISRC is dropped.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      recordingId: 'rec-gid-paranoid',
      title: 'Paranoid Android',
      artistId: 'artist-gid-radiohead',
      artist: 'Radiohead',
      releaseGroupId: 'rg-gid-okcomputer',
      releaseTitle: 'OK Computer',
      year: 1997,
      durationMs: 383000,
      isrc: 'GBAYE6700477',
      country: 'United Kingdom',
      language: 'eng',
      // Genre tags on the release group, most-voted first; the non-genre tag
      // (favourites) and the untagged genre (electronic) are excluded.
      genres: ['rock', 'alternative'],
    });
  });
});
