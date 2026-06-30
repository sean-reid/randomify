import { bulkUpsert, toPgArray } from './bulk.js';
import { applySchema, type CorpusData, type SqlClient } from './export.js';

/**
 * Incrementally upsert a batch of newly-resolved recordings into the serving
 * corpus, without touching the rest of it. Used by the hourly resolve job
 * (unlike exportCorpus, which truncate-reloads the whole corpus). Weights are
 * not touched here; they are recomputed by the separate weight-rebuild job.
 */
export async function upsertCorpus(
  client: SqlClient,
  data: Pick<CorpusData, 'artists' | 'releaseGroups' | 'recordings' | 'links'>,
): Promise<void> {
  await applySchema(client);

  await bulkUpsert(
    client,
    'artist',
    [
      { name: 'id', type: 'text' },
      { name: 'name', type: 'text' },
      { name: 'country', type: 'text' },
    ],
    data.artists.map((a) => [a.id, a.name, a.country]),
    'id',
  );
  await bulkUpsert(
    client,
    'release_group',
    [
      { name: 'id', type: 'text' },
      { name: 'artist_id', type: 'text' },
      { name: 'title', type: 'text' },
      { name: 'year', type: 'int' },
    ],
    data.releaseGroups.map((rg) => [rg.id, rg.artistId, rg.title, rg.year]),
    'id',
  );
  await bulkUpsert(
    client,
    'recording',
    [
      { name: 'id', type: 'text' },
      { name: 'artist_id', type: 'text' },
      { name: 'release_group_id', type: 'text' },
      { name: 'title', type: 'text' },
      { name: 'isrc', type: 'text' },
      { name: 'duration_ms', type: 'int' },
      { name: 'year', type: 'int' },
      { name: 'language', type: 'text' },
      { name: 'cover_art_url', type: 'text' },
      { name: 'preview_url', type: 'text' },
      { name: 'genres', type: 'text', cast: 'text[]' },
    ],
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
      r.previewUrl,
      toPgArray(r.genres),
    ]),
    'id',
  );
  await bulkUpsert(
    client,
    'platform_link',
    [
      { name: 'recording_id', type: 'text' },
      { name: 'platform', type: 'text' },
      { name: 'url', type: 'text' },
      { name: 'kind', type: 'text' },
      { name: 'confidence', type: 'double precision' },
    ],
    data.links.map((l) => [l.recordingId, l.platform, l.url, l.kind, l.confidence]),
    'recording_id, platform',
  );
}
