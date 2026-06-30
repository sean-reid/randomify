import { applySchema, insertWeights, type SqlClient } from '../corpus/export.js';
import { buildWeights, type StreamableRecording } from '../corpus/weights.js';

function decadeOf(year: number | null): string | null {
  return year == null ? null : `${Math.floor(year / 10) * 10}s`;
}

/**
 * Recompute the tempered prefix-sum weight index from the current streamable
 * corpus and atomically reload the four weight tables. Run on its own (daily)
 * cadence because it is O(corpus); the hourly resolve job leaves weights alone.
 */
export async function rebuildWeights(client: SqlClient): Promise<{ recordings: number }> {
  await applySchema(client);

  const { rows } = await client.query(
    `SELECT r.id AS recording_id, r.artist_id, r.release_group_id, r.genres,
            r.year, r.language, a.country
     FROM recording r JOIN artist a ON a.id = r.artist_id`,
  );

  const streamable: StreamableRecording[] = rows.map((row) => ({
    recordingId: String(row.recording_id),
    artistId: String(row.artist_id),
    releaseGroupId: String(row.release_group_id),
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
    decade: decadeOf(row.year == null ? null : Number(row.year)),
    country: row.country == null ? null : String(row.country),
    language: row.language == null ? null : String(row.language),
  }));

  const weights = buildWeights(streamable);

  await client.query('BEGIN');
  try {
    await client.query(
      'TRUNCATE facet_value, facet_artist, artist_release_group, release_group_recording',
    );
    await insertWeights(client, weights);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  return { recordings: streamable.length };
}
