import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { PostgresResolutionCache } from './postgres-cache.js';
import type { SqlClient } from '../corpus/export.js';
import type { Resolution } from '../resolvers/types.js';

function client(db: PGlite): SqlClient {
  return { query: (sql, params) => db.query(sql, params) };
}

const resolution: Resolution = {
  platform: 'deezer',
  url: 'https://www.deezer.com/track/3135556',
  kind: 'exact',
  confidence: 1,
  strategy: 'deezer:isrc',
};

describe('PostgresResolutionCache', () => {
  it('stores and returns a resolution', async () => {
    const db = new PGlite();
    const cache = new PostgresResolutionCache(client(db));
    await cache.init();

    expect(await cache.get('GBAYE6700477', 'deezer')).toBeUndefined();
    await cache.set('GBAYE6700477', 'deezer', resolution);
    expect(await cache.get('GBAYE6700477', 'deezer')).toEqual(resolution);
  });

  it('persists across cache instances on the same database', async () => {
    const db = new PGlite();
    await new PostgresResolutionCache(client(db)).init();
    await new PostgresResolutionCache(client(db)).set('X', 'spotify', {
      ...resolution,
      platform: 'spotify',
    });
    // A fresh instance (a later pipeline run) sees the cached resolution.
    const later = await new PostgresResolutionCache(client(db)).get('X', 'spotify');
    expect(later?.url).toBe(resolution.url);
  });

  it('upserts on a repeat key without erroring', async () => {
    const db = new PGlite();
    const cache = new PostgresResolutionCache(client(db));
    await cache.init();
    await cache.set('X', 'deezer', resolution);
    await cache.set('X', 'deezer', { ...resolution, url: 'https://www.deezer.com/track/999' });
    expect((await cache.get('X', 'deezer'))?.url).toBe('https://www.deezer.com/track/999');
  });
});
