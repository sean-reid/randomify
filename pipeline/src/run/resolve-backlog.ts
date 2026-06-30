import type { PlatformId } from '@randomify/shared';
import type { SqlClient } from '../corpus/export.js';
import { upsertCorpus } from '../corpus/upsert.js';
import type { HealthVerdict, RunMetrics } from '../resolvers/health.js';
import { RESOLVERS } from '../resolvers/registry.js';
import type { PlatformResolver } from '../resolvers/types.js';
import { markResolved, selectUnresolved } from './backlog.js';
import { buildCorpusData } from './build-corpus.js';
import { resolveAll, type ResolutionCache } from './resolve-batch.js';

export interface ResolveBacklogOptions {
  limit: number;
  resolvers?: readonly PlatformResolver[];
  cache?: ResolutionCache;
}

export interface ResolveBacklogSummary {
  processed: number;
  streamable: number;
  metrics: Record<string, RunMetrics>;
  health: Record<string, HealthVerdict>;
}

function fromMap<V>(map: ReadonlyMap<PlatformId, V>): Record<string, V> {
  return Object.fromEntries(map);
}

/**
 * One incremental resolve pass: pull a chunk of unresolved recordings from the
 * backlog, resolve their links (throttled + cached), upsert the streamable ones
 * into the serving corpus, and mark the chunk resolved. Idempotent and
 * resumable - a crash just leaves the chunk unmarked for the next run. Weights
 * are recomputed separately by the weight-rebuild job.
 */
export async function resolveBacklog(
  client: SqlClient,
  options: ResolveBacklogOptions,
): Promise<ResolveBacklogSummary> {
  const resolvers = options.resolvers ?? RESOLVERS;
  const chunk = await selectUnresolved(client, options.limit);
  if (chunk.length === 0) {
    return { processed: 0, streamable: 0, metrics: {}, health: {} };
  }

  const { resolutionsByRecording, metricsByPlatform, healthByPlatform } = await resolveAll(
    chunk,
    resolvers,
    options.cache ? { cache: options.cache } : {},
  );

  const corpus = buildCorpusData(chunk, resolutionsByRecording);
  await upsertCorpus(client, corpus);
  await markResolved(
    client,
    chunk.map((r) => r.recordingId),
  );

  return {
    processed: chunk.length,
    streamable: corpus.recordings.length,
    metrics: fromMap(metricsByPlatform),
    health: fromMap(healthByPlatform),
  };
}
