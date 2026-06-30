import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { upsertCorpus } from './upsert.js';
import type { CorpusData, SqlClient } from './export.js';

function client(db: PGlite): SqlClient {
  return { query: (sql, params) => db.query(sql, params) };
}

function data(
  linkUrl: string,
): Pick<CorpusData, 'artists' | 'releaseGroups' | 'recordings' | 'links'> {
  return {
    artists: [{ id: 'a1', name: 'Artist', country: 'US' }],
    releaseGroups: [{ id: 'rg1', artistId: 'a1', title: 'RG', year: 1995 }],
    recordings: [
      {
        id: 'r1',
        artistId: 'a1',
        releaseGroupId: 'rg1',
        title: 'Song',
        isrc: 'AAA',
        durationMs: 200000,
        year: 1995,
        language: 'eng',
        coverArtUrl: null,
        genres: ['rock', 'bossa nova'],
      },
    ],
    links: [{ recordingId: 'r1', platform: 'deezer', url: linkUrl, kind: 'exact', confidence: 1 }],
  };
}

describe('upsertCorpus', () => {
  it('inserts without truncating and updates on conflict', async () => {
    const db = new PGlite();
    await upsertCorpus(client(db), data('https://deezer/v1'));

    // add a second recording's batch; the first must remain (no truncate)
    await upsertCorpus(client(db), {
      artists: [{ id: 'a2', name: 'Two', country: 'GB' }],
      releaseGroups: [{ id: 'rg2', artistId: 'a2', title: 'RG2', year: 2000 }],
      recordings: [
        {
          id: 'r2',
          artistId: 'a2',
          releaseGroupId: 'rg2',
          title: 'Two',
          isrc: 'BBB',
          durationMs: 100000,
          year: 2000,
          language: 'eng',
          coverArtUrl: null,
          genres: [],
        },
      ],
      links: [
        {
          recordingId: 'r2',
          platform: 'deezer',
          url: 'https://deezer/2',
          kind: 'exact',
          confidence: 1,
        },
      ],
    });

    const recs = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM recording');
    expect(recs.rows[0]!.n).toBe(2);

    // re-upsert r1's link with a new URL -> updates, no duplicate
    await upsertCorpus(client(db), data('https://deezer/v2'));
    const links = await db.query<{ n: number; url: string }>(
      `SELECT count(*)::int AS n, max(url) AS url FROM platform_link WHERE recording_id = 'r1'`,
    );
    expect(links.rows[0]!.n).toBe(1);
    expect(links.rows[0]!.url).toBe('https://deezer/v2');

    const genres = await db.query<{ genres: string[] }>(
      `SELECT genres FROM recording WHERE id = 'r1'`,
    );
    expect([...genres.rows[0]!.genres].sort()).toEqual(['bossa nova', 'rock']);
  });
});
