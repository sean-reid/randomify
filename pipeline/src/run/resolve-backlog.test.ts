import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { populateBacklog } from './backlog.js';
import { resolveBacklog } from './resolve-backlog.js';
import { InMemoryResolutionCache } from './resolve-batch.js';
import type { SqlClient } from '../corpus/export.js';
import type { NormalizedRecording } from '../ingest/ingest.js';
import type { PlatformResolver } from '../resolvers/types.js';

function client(db: PGlite): SqlClient {
  return { query: (sql, params) => db.query(sql, params) };
}

// Resolves an exact link only when the recording has an ISRC.
const exactIfIsrc: PlatformResolver = {
  platform: 'deezer',
  approach: 'isrc-api',
  strategies: [
    {
      name: 'fake',
      run: (fp) =>
        Promise.resolve(
          fp.isrc
            ? { url: `https://deezer/${fp.isrc}`, matched: fp, trusted: true, previewUrl: 'p' }
            : null,
        ),
    },
  ],
};

function rec(id: string, artistId: string, isrc: string | null): NormalizedRecording {
  return {
    recordingId: id,
    title: id,
    artistId,
    artist: artistId,
    releaseGroupId: `rg-${id}`,
    releaseTitle: 'RG',
    year: 2000,
    durationMs: 200000,
    isrc,
    country: 'US',
    language: 'eng',
    genres: ['rock'],
  };
}

async function count(db: PGlite, table: string): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return res.rows[0]!.n;
}

describe('resolveBacklog', () => {
  it('resolves a chunk, upserts streamable recordings, and marks the backlog', async () => {
    const db = new PGlite();
    await populateBacklog(client(db), [
      rec('a', 'art1', 'AAA'),
      rec('b', 'art2', null),
      rec('c', 'art1', 'CCC'),
    ]);

    const summary = await resolveBacklog(client(db), {
      limit: 10,
      resolvers: [exactIfIsrc],
      cache: new InMemoryResolutionCache(),
    });

    // a and c have ISRCs (streamable); b does not.
    expect(summary.processed).toBe(3);
    expect(summary.streamable).toBe(2);
    expect(await count(db, 'recording')).toBe(2);
    expect(await count(db, 'platform_link')).toBe(2);

    // Everything pulled is marked resolved, so a second pass does nothing.
    const second = await resolveBacklog(client(db), { limit: 10, resolvers: [exactIfIsrc] });
    expect(second.processed).toBe(0);
  });

  it('processes the backlog in priority-bounded chunks across runs', async () => {
    const db = new PGlite();
    await populateBacklog(
      client(db),
      Array.from({ length: 5 }, (_, i) => rec(`r${i}`, `art${i}`, `ISRC${i}`)),
    );
    const cache = new InMemoryResolutionCache();

    const first = await resolveBacklog(client(db), { limit: 2, resolvers: [exactIfIsrc], cache });
    expect(first.processed).toBe(2);
    const second = await resolveBacklog(client(db), { limit: 2, resolvers: [exactIfIsrc], cache });
    expect(second.processed).toBe(2);
    const third = await resolveBacklog(client(db), { limit: 2, resolvers: [exactIfIsrc], cache });
    expect(third.processed).toBe(1);
    expect(await count(db, 'recording')).toBe(5);
  });
});
