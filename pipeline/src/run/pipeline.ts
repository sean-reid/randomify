import type { PlatformId } from '@randomify/shared';
import { ingest } from '../ingest/ingest.js';
import { RESOLVERS } from '../resolvers/registry.js';
import type { PlatformResolver } from '../resolvers/types.js';
import type { HealthVerdict, RunMetrics } from '../resolvers/health.js';
import { exportCorpus, type SqlClient } from '../corpus/export.js';
import { buildCorpusData } from './build-corpus.js';
import { prioritize } from './prioritize.js';
import { resolveAll, type ResolutionCache } from './resolve-batch.js';

export interface PipelineOptions {
  /** Directory of extracted MusicBrainz TSVs. */
  ingestDir: string;
  /** Postgres client to export the rebuilt corpus into. */
  client: SqlClient;
  /** Resolvers to use (defaults to the full registry). */
  resolvers?: readonly PlatformResolver[];
  /** Permanent resolution cache so re-runs only resolve what is new. */
  cache?: ResolutionCache;
  /** Cap how many recordings to resolve this run (the backlog batch size). */
  limit?: number;
}

export interface PipelineSummary {
  ingested: number;
  resolved: number;
  streamable: number;
  metrics: Record<string, RunMetrics>;
  health: Record<string, HealthVerdict>;
}

/**
 * One pipeline pass: ingest the MusicBrainz subset, prioritize the backlog,
 * resolve links (cached), assemble the streamable corpus, and export it
 * atomically. Re-running grows the population as the cache fills and the limit
 * advances over the backlog.
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineSummary> {
  const resolvers = options.resolvers ?? RESOLVERS;

  const ingested = await ingest(options.ingestDir);
  const ordered = prioritize(ingested);
  const batch = options.limit ? ordered.slice(0, options.limit) : ordered;

  const { resolutionsByRecording, metricsByPlatform, healthByPlatform } = await resolveAll(
    batch,
    resolvers,
    options.cache ? { cache: options.cache } : {},
  );

  const corpus = buildCorpusData(batch, resolutionsByRecording);
  await exportCorpus(options.client, corpus);

  return {
    ingested: ingested.length,
    resolved: batch.length,
    streamable: corpus.recordings.length,
    metrics: fromMap(metricsByPlatform),
    health: fromMap(healthByPlatform),
  };
}

function fromMap<V>(map: ReadonlyMap<PlatformId, V>): Record<string, V> {
  return Object.fromEntries(map);
}
