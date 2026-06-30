import type { PlatformId } from '@randomify/shared';
import type { SqlClient } from '../corpus/export.js';
import type { LinkKind } from '@randomify/shared';
import type { Resolution } from '../resolvers/types.js';
import type { ResolutionCache } from './resolve-batch.js';

/**
 * Resolution cache stored in Postgres so resolved links persist across pipeline
 * runs. It lives in its own table (never truncated by the corpus export), which
 * is what lets the streamable population grow run over run: each pass only
 * resolves ISRCs it has not seen before.
 */
const CACHE_SCHEMA = `
CREATE TABLE IF NOT EXISTS resolution_cache (
  isrc        TEXT NOT NULL,
  platform    TEXT NOT NULL,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL,
  confidence  DOUBLE PRECISION NOT NULL,
  strategy    TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (isrc, platform)
);
`;

export class PostgresResolutionCache implements ResolutionCache {
  constructor(private readonly client: SqlClient) {}

  /** Create the cache table if it does not exist. Call once before use. */
  async init(): Promise<void> {
    await this.client.query(CACHE_SCHEMA);
  }

  async get(isrc: string, platform: PlatformId): Promise<Resolution | undefined> {
    const { rows } = await this.client.query(
      `SELECT url, kind, confidence, strategy FROM resolution_cache
       WHERE isrc = $1 AND platform = $2`,
      [isrc, platform],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      platform,
      url: String(row.url),
      kind: row.kind as LinkKind,
      confidence: Number(row.confidence),
      strategy: row.strategy == null ? null : String(row.strategy),
    };
  }

  async set(isrc: string, platform: PlatformId, resolution: Resolution): Promise<void> {
    await this.client.query(
      `INSERT INTO resolution_cache (isrc, platform, url, kind, confidence, strategy)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (isrc, platform) DO UPDATE SET
         url = EXCLUDED.url,
         kind = EXCLUDED.kind,
         confidence = EXCLUDED.confidence,
         strategy = EXCLUDED.strategy,
         resolved_at = now()`,
      [isrc, platform, resolution.url, resolution.kind, resolution.confidence, resolution.strategy],
    );
  }
}
