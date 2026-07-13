import type { PlatformId } from '@randomify/shared';
import type { SqlClient } from '../corpus/export.js';
import { upsertCorpus } from '../corpus/upsert.js';
import { evaluateHealth, type HealthVerdict, type RunMetrics } from '../resolvers/health.js';
import { RESOLVERS } from '../resolvers/registry.js';
import type { PlatformResolver } from '../resolvers/types.js';
import { markResolved, selectUnresolved } from './backlog.js';
import { buildCorpusData } from './build-corpus.js';
import { resolveAll, type ResolutionCache } from './resolve-batch.js';

/**
 * Default checkpoint size. A pass pulls up to `limit` unresolved recordings and
 * resolves them in sub-batches of this size: each sub-batch is resolved against
 * the platforms, persisted, and marked before the next begins. This bounds a
 * crash's loss to one checkpoint and - crucially - releases the DB connection
 * between checkpoints, so during each checkpoint's DB-idle Deezer phase the Neon
 * compute can suspend instead of being billed for the whole multi-hour pass.
 */
const DEFAULT_CHECKPOINT = 25_000;

export interface ResolveBacklogOptions {
  limit: number;
  /** Resolve/persist/mark in sub-batches of this many recordings (default 25k). */
  checkpointSize?: number;
  resolvers?: readonly PlatformResolver[];
  cache?: ResolutionCache;
  /** Invoked after each checkpoint is persisted, e.g. to emit a liveness ping. */
  onCheckpoint?: (progress: { processed: number; streamable: number }) => void | Promise<void>;
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

function emptyMetrics(): RunMetrics {
  return { attempts: 0, exactHits: 0, fallbacks: 0, errors: 0, canaryPass: 0, canaryTotal: 0 };
}

function addMetrics(into: RunMetrics, from: RunMetrics): void {
  into.attempts += from.attempts;
  into.exactHits += from.exactHits;
  into.fallbacks += from.fallbacks;
  into.errors += from.errors;
  into.canaryPass += from.canaryPass;
  into.canaryTotal += from.canaryTotal;
}

/**
 * One incremental resolve pass: pull up to `limit` unresolved recordings from the
 * backlog (highest priority first) and work through them in checkpoints. Each
 * checkpoint resolves its links (throttled + cached), upserts the streamable ones
 * into the serving corpus, and marks the sub-batch resolved. Idempotent and
 * resumable - a crash just leaves the unmarked remainder for the next run.
 * Weights are recomputed separately by the weight-rebuild job.
 */
export async function resolveBacklog(
  client: SqlClient,
  options: ResolveBacklogOptions,
): Promise<ResolveBacklogSummary> {
  const resolvers = options.resolvers ?? RESOLVERS;
  const checkpointSize = Math.max(1, options.checkpointSize ?? DEFAULT_CHECKPOINT);
  const chunk = await selectUnresolved(client, options.limit);
  if (chunk.length === 0) {
    return { processed: 0, streamable: 0, metrics: {}, health: {} };
  }

  const totalMetrics = new Map<PlatformId, RunMetrics>();
  let processed = 0;
  let streamable = 0;

  for (let start = 0; start < chunk.length; start += checkpointSize) {
    const sub = chunk.slice(start, start + checkpointSize);
    const { resolutionsByRecording, metricsByPlatform } = await resolveAll(
      sub,
      resolvers,
      options.cache ? { cache: options.cache } : {},
    );

    const corpus = buildCorpusData(sub, resolutionsByRecording);
    await upsertCorpus(client, corpus);
    await markResolved(
      client,
      sub.map((r) => r.recordingId),
    );

    for (const [platform, metrics] of metricsByPlatform) {
      const total = totalMetrics.get(platform) ?? emptyMetrics();
      addMetrics(total, metrics);
      totalMetrics.set(platform, total);
    }
    processed += sub.length;
    streamable += corpus.recordings.length;
    await options.onCheckpoint?.({ processed, streamable });
  }

  const healthByPlatform = new Map<PlatformId, HealthVerdict>();
  for (const [platform, metrics] of totalMetrics) {
    healthByPlatform.set(platform, evaluateHealth(metrics, null));
  }

  return {
    processed,
    streamable,
    metrics: fromMap(totalMetrics),
    health: fromMap(healthByPlatform),
  };
}
