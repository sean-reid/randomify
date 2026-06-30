import { applySchema, type CorpusData, type SqlClient } from './export.js';

/**
 * Incrementally upsert a batch of newly-resolved recordings into the serving
 * corpus, without touching the rest of it. Used by the hourly resolve job
 * (unlike exportCorpus, which truncate-reloads the whole corpus). Weights are
 * not touched here; they are recomputed by the separate weight-rebuild job.
 */
const CHUNK = 1000;

function toPgArray(items: string[]): string {
  return `{${items.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

async function upsert(
  client: SqlClient,
  table: string,
  columns: string[],
  conflict: string,
  rows: readonly unknown[][],
): Promise<void> {
  const updates = columns
    .filter((c) => !conflict.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((values) => {
      const ph = values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}
       ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`,
      params,
    );
  }
}

export async function upsertCorpus(
  client: SqlClient,
  data: Pick<CorpusData, 'artists' | 'releaseGroups' | 'recordings' | 'links'>,
): Promise<void> {
  await applySchema(client);

  await upsert(
    client,
    'artist',
    ['id', 'name', 'country'],
    'id',
    data.artists.map((a) => [a.id, a.name, a.country]),
  );
  await upsert(
    client,
    'release_group',
    ['id', 'artist_id', 'title', 'year'],
    'id',
    data.releaseGroups.map((rg) => [rg.id, rg.artistId, rg.title, rg.year]),
  );
  await upsert(
    client,
    'recording',
    [
      'id',
      'artist_id',
      'release_group_id',
      'title',
      'isrc',
      'duration_ms',
      'year',
      'language',
      'cover_art_url',
      'genres',
    ],
    'id',
    data.recordings.map((r) => [
      r.id,
      r.artistId,
      r.releaseGroupId,
      r.title,
      r.isrc,
      r.durationMs,
      r.year,
      r.language,
      r.coverArtUrl,
      toPgArray(r.genres),
    ]),
  );
  await upsert(
    client,
    'platform_link',
    ['recording_id', 'platform', 'url', 'kind', 'confidence'],
    'recording_id, platform',
    data.links.map((l) => [l.recordingId, l.platform, l.url, l.kind, l.confidence]),
  );
}
