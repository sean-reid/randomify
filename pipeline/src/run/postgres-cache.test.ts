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
  it('buffers a set in memory and returns it via get', async () => {
    const db = new PGlite();
    const cache = new PostgresResolutionCache(client(db));
    await cache.init();
    expect(await cache.get('GBAYE6700477', 'deezer')).toBeUndefined();
    await cache.set('GBAYE6700477', 'deezer', resolution);
    expect(await cache.get('GBAYE6700477', 'deezer')).toEqual(resolution);
  });

  it('persists on flush and reloads via preload in a fresh instance', async () => {
    const db = new PGlite();
    const writer = new PostgresResolutionCache(client(db));
    await writer.init();
    await writer.set('X', 'spotify', { ...resolution, platform: 'spotify' });

    // A fresh instance sees nothing until the writer flushes and it preloads.
    const reader = new PostgresResolutionCache(client(db));
    expect(await reader.get('X', 'spotify')).toBeUndefined();
    await writer.flush();
    await reader.preload(['X']);
    expect((await reader.get('X', 'spotify'))?.url).toBe(resolution.url);
  });

  it('upserts on a repeat key', async () => {
    const db = new PGlite();
    const cache = new PostgresResolutionCache(client(db));
    await cache.init();
    await cache.set('X', 'deezer', resolution);
    await cache.flush();
    await cache.set('X', 'deezer', { ...resolution, url: 'https://www.deezer.com/track/999' });
    await cache.flush();
    const reader = new PostgresResolutionCache(client(db));
    await reader.preload(['X']);
    expect((await reader.get('X', 'deezer'))?.url).toBe('https://www.deezer.com/track/999');
  });
});
