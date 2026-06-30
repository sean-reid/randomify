import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runPipeline } from './pipeline.js';
import { InMemoryResolutionCache } from './resolve-batch.js';
import type { PlatformResolver } from '../resolvers/types.js';
import type { SqlClient } from '../corpus/export.js';

const SAMPLE_DIR = fileURLToPath(new URL('../../fixtures/mb-sample', import.meta.url));

// Resolves an exact link only when the recording has an ISRC.
const exactIfIsrc: PlatformResolver = {
  platform: 'deezer',
  approach: 'isrc-api',
  strategies: [
    {
      name: 'fake',
      run: (fp) =>
        Promise.resolve(
          fp.isrc ? { url: `https://deezer/${fp.isrc}`, matched: fp, trusted: true } : null,
        ),
    },
  ],
};

function pgliteClient(db: PGlite): SqlClient {
  return { query: (sql, params) => db.query(sql, params) };
}

describe('runPipeline', () => {
  it('ingests, resolves, and exports a streamable corpus end to end', async () => {
    const db = new PGlite();
    const summary = await runPipeline({
      ingestDir: SAMPLE_DIR,
      client: pgliteClient(db),
      resolvers: [exactIfIsrc],
      cache: new InMemoryResolutionCache(),
    });

    // The fixture has 4 recordings; 3 carry an ISRC, so 3 are streamable.
    expect(summary.ingested).toBe(4);
    expect(summary.streamable).toBe(3);
    expect(summary.metrics.deezer!.attempts).toBe(4);
    expect(summary.metrics.deezer!.exactHits).toBe(3);

    const recordings = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM recording');
    expect(recordings.rows[0]!.n).toBe(3);
    const facets = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM facet_value');
    expect(facets.rows[0]!.n).toBeGreaterThan(0);
  });

  it('caches exact resolutions across runs', async () => {
    const cache = new InMemoryResolutionCache();
    let calls = 0;
    const counting: PlatformResolver = {
      platform: 'deezer',
      approach: 'isrc-api',
      strategies: [
        {
          name: 'counting',
          run: (fp) => {
            calls += 1;
            return Promise.resolve(
              fp.isrc ? { url: `https://deezer/${fp.isrc}`, matched: fp, trusted: true } : null,
            );
          },
        },
      ],
    };
    const opts = { ingestDir: SAMPLE_DIR, resolvers: [counting], cache };

    await runPipeline({ ...opts, client: pgliteClient(new PGlite()) });
    const afterFirst = calls;
    await runPipeline({ ...opts, client: pgliteClient(new PGlite()) });
    // The second run serves the three ISRC recordings from cache, so the
    // strategy only runs again for the one ISRC-less recording.
    expect(calls - afterFirst).toBeLessThan(afterFirst);
  });
});
