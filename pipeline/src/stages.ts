/**
 * The corpus build pipeline, expressed as an ordered list of stages. The heavy
 * lifting (DuckDB over the MusicBrainz dumps, the resolver backlog) is wired up
 * in follow-up work; this captures the plan and its ordering so the shape is
 * fixed and testable.
 */
export interface Stage {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

export const PIPELINE_STAGES: readonly Stage[] = [
  {
    id: 'acquire',
    title: 'Acquire dumps',
    detail:
      'Pull the latest MusicBrainz data dumps (artist, release-group, recording, ISRC, tags) into R2.',
  },
  {
    id: 'load',
    title: 'Load into DuckDB',
    detail: 'Read the dump TSVs into DuckDB for columnar aggregation.',
  },
  {
    id: 'normalize',
    title: 'Normalize',
    detail: 'Join ISRCs and genre tags; build the artist -> release-group -> recording hierarchy.',
  },
  {
    id: 'resolve',
    title: 'Resolve links',
    detail:
      'Drain the ISRC backlog through the per-platform resolvers (anchor, then match, then fallback).',
  },
  {
    id: 'filter',
    title: 'Filter to streamable',
    detail: 'Keep recordings that resolved to at least one exact streaming link.',
  },
  {
    id: 'weights',
    title: 'Compute weights',
    detail:
      'Aggregate streamable-descendant counts and build the tempered prefix-sum index tables.',
  },
  {
    id: 'export',
    title: 'Blue-green export',
    detail:
      'Write into versioned tables and swap atomically so serving never sees a half-built corpus.',
  },
];

/** Stage ids in execution order. */
export function stageOrder(): string[] {
  return PIPELINE_STAGES.map((s) => s.id);
}
