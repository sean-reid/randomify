import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { markResolved, populateBacklog, selectUnresolved } from './backlog.js';
import type { SqlClient } from '../corpus/export.js';
import type { NormalizedRecording } from '../ingest/ingest.js';

function client(db: PGlite): SqlClient {
  return { query: (sql, params) => db.query(sql, params) };
}

function rec(
  id: string,
  artistId: string,
  partial: Partial<NormalizedRecording> = {},
): NormalizedRecording {
  return {
    recordingId: id,
    title: id,
    artistId,
    artist: artistId,
    releaseGroupId: `rg-${id}`,
    releaseTitle: 'RG',
    year: 2000,
    durationMs: 200000,
    isrc: `isrc-${id}`,
    country: 'US',
    language: 'eng',
    genres: ['rock'],
    ...partial,
  };
}

describe('recording backlog', () => {
  it('populates, selects unresolved by priority, and marks resolved', async () => {
    const db = new PGlite();
    await populateBacklog(client(db), [rec('a', 'art1'), rec('b', 'art2'), rec('c', 'art1')]);

    const first = await selectUnresolved(client(db), 2);
    expect(first).toHaveLength(2);
    // round-robin priority: each artist's first before any artist's second
    expect(new Set(first.map((r) => r.artistId))).toEqual(new Set(['art1', 'art2']));

    await markResolved(client(db), [first[0]!.recordingId, first[1]!.recordingId]);
    const remaining = await selectUnresolved(client(db), 10);
    expect(remaining.map((r) => r.recordingId)).not.toContain(first[0]!.recordingId);
    expect(remaining).toHaveLength(1);
  });

  it('preserves resolved_at and genres when re-populating', async () => {
    const db = new PGlite();
    await populateBacklog(client(db), [rec('a', 'art1', { genres: ['jazz', 'bossa nova'] })]);
    const [one] = await selectUnresolved(client(db), 10);
    expect(one!.genres.sort()).toEqual(['bossa nova', 'jazz']);

    await markResolved(client(db), ['a']);
    // a refresh (re-populate) must NOT re-queue an already-resolved recording
    await populateBacklog(client(db), [rec('a', 'art1'), rec('d', 'art3')]);
    const unresolved = await selectUnresolved(client(db), 10);
    expect(unresolved.map((r) => r.recordingId)).toEqual(['d']);
  });
});
