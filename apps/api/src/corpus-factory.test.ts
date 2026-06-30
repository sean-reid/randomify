import { describe, expect, it } from 'vitest';
import { getCorpus } from './corpus-factory.js';
import { DemoCorpusProvider } from './demo-corpus.js';
import { PostgresCorpusProvider } from './postgres-corpus.js';
import type { Env } from './env.js';

describe('getCorpus', () => {
  it('serves the demo corpus without a Hyperdrive binding', () => {
    const handle = getCorpus({} as Env);
    expect(handle.provider).toBeInstanceOf(DemoCorpusProvider);
  });

  it('serves the Postgres corpus when Hyperdrive is bound', async () => {
    const handle = getCorpus({
      HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/corpus' },
    } as Env);
    expect(handle.provider).toBeInstanceOf(PostgresCorpusProvider);
    // No query was issued, so closing is a no-op cleanup.
    await handle.close();
  });
});
