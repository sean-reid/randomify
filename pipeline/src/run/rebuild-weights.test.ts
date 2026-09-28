import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { rebuildWeights } from './rebuild-weights.js';
import { upsertCorpus } from '../corpus/upsert.js';
import type { CorpusData, SqlClient } from '../corpus/export.js';

function client(db: PGlite): SqlClient {
  return { query: (sql, params) => db.query(sql, params) };
}

const corpus: Pick<CorpusData, 'artists' | 'releaseGroups' | 'recordings' | 'links'> = {
  artists: [
    { id: 'a1', name: 'A1', country: 'GB' },
    { id: 'a2', name: 'A2', country: 'US' },
  ],
  releaseGroups: [
    { id: 'rg1', artistId: 'a1', title: 'RG1', year: 1997 },
    { id: 'rg2', artistId: 'a2', title: 'RG2', year: 2003 },
  ],
  recordings: [
    {
      id: 'r1',
      artistId: 'a1',
      releaseGroupId: 'rg1',
      title: 'One',
      isrc: 'A',
      durationMs: 1,
      year: 1997,
      language: 'eng',
      coverArtUrl: null,
      previewUrl: null,
      genres: ['rock'],
    },
    {
      id: 'r2',
      artistId: 'a1',
      releaseGroupId: 'rg1',
      title: 'Two',
      isrc: 'B',
      durationMs: 1,
      year: 1997,
      language: 'eng',
      coverArtUrl: null,
      previewUrl: null,
      genres: ['rock', 'alternative'],
    },
    {
      id: 'r3',
      artistId: 'a2',
      releaseGroupId: 'rg2',
      title: 'Three',
      isrc: 'C',
      durationMs: 1,
      year: 2003,
      language: 'spa',
      coverArtUrl: null,
      previewUrl: null,
      genres: ['pop'],
    },
  ],
  links: [],
};

describe('rebuildWeights', () => {
  it('recomputes the weight index from the serving corpus', async () => {
    const db = new PGlite();
    await upsertCorpus(client(db), corpus);

    const summary = await rebuildWeights(client(db));
    expect(summary.recordings).toBe(3);

    const facetTypes = await db.query<{ facet_type: string }>(
      `SELECT DISTINCT facet_type FROM facet_value ORDER BY facet_type`,
    );
    // genre, decade, country, language all derived from the corpus
    expect(facetTypes.rows.map((r) => r.facet_type).sort()).toEqual([
      'country',
      'decade',
      'genre',
      'language',
    ]);

    const recCount = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM release_group_recording`,
    );
    expect(recCount.rows[0]!.n).toBe(3);

    // cum_weight strictly increasing within a facet type
    const cums = await db.query<{ cum_weight: number }>(
      `SELECT cum_weight FROM facet_value WHERE facet_type = 'genre' ORDER BY cum_weight`,
    );
    const values = cums.rows.map((r) => Number(r.cum_weight));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
  });

  it('leaves the canonical index names in public and no scratch schema behind', async () => {
    const db = new PGlite();
    await upsertCorpus(client(db), corpus);
    await rebuildWeights(client(db));

    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
       AND tablename IN ('facet_value', 'sample_recording') ORDER BY indexname`,
    );
    expect(indexes.rows.map((r) => r.indexname)).toEqual([
      'facet_value_pkey',
      'facet_value_walk',
      'sample_recording_artist',
      'sample_recording_country',
      'sample_recording_decade',
      'sample_recording_genres',
      'sample_recording_language',
      'sample_recording_pkey',
    ]);

    const schemas = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'weights_next'`,
    );
    expect(schemas.rows[0]!.n).toBe(0);
  });

  it('keeps the previous index readable while the new one is being built', async () => {
    const db = new PGlite();
    await upsertCorpus(client(db), corpus);
    await rebuildWeights(client(db));

    // Fail the build partway through, after the scratch schema exists, and
    // check the live tables were never touched.
    const failing: SqlClient = {
      query: (sql, params) => {
        if (sql.startsWith('ANALYZE')) throw new Error('boom');
        return db.query(sql, params);
      },
    };
    await expect(rebuildWeights(failing)).rejects.toThrow('boom');
    const n = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM release_group_recording`,
    );
    expect(n.rows[0]!.n).toBe(3);
  });

  it('works on a corpus that has never had a weight index', async () => {
    const db = new PGlite();
    await upsertCorpus(client(db), corpus);
    await db.exec(
      'DROP TABLE facet_value, facet_artist, artist_release_group, release_group_recording, sample_recording, facet_catalog',
    );

    const summary = await rebuildWeights(client(db));
    expect(summary.recordings).toBe(3);
    const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM sample_recording`);
    expect(n.rows[0]!.n).toBe(3);
  });

  it('is idempotent (re-run replaces, no duplication)', async () => {
    const db = new PGlite();
    await upsertCorpus(client(db), corpus);
    await rebuildWeights(client(db));
    await rebuildWeights(client(db));
    const n = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM release_group_recording`,
    );
    expect(n.rows[0]!.n).toBe(3);
  });
});
