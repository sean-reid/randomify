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
