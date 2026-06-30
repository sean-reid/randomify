import type { NormalizedRecording } from '../ingest/ingest.js';
import type { Resolution } from '../resolvers/types.js';
import type {
  CorpusArtist,
  CorpusData,
  CorpusLink,
  CorpusRecording,
  CorpusReleaseGroup,
} from '../corpus/export.js';
import { buildWeights, type StreamableRecording } from '../corpus/weights.js';

function decadeOf(year: number | null): string | null {
  return year == null ? null : `${Math.floor(year / 10) * 10}s`;
}

/**
 * Assemble the serving corpus from resolved recordings. A recording is kept only
 * if it was found on Deezer (an exact Deezer link) - that is the catalog we can
 * play a preview from and our anchor for the corpus. The full link row (exact
 * plus search fallbacks) is preserved so every platform still shows.
 */
export function buildCorpusData(
  recordings: readonly NormalizedRecording[],
  resolutionsByRecording: ReadonlyMap<string, Resolution[]>,
): CorpusData {
  const streamableRecordings = recordings.filter((recording) => {
    const resolutions = resolutionsByRecording.get(recording.recordingId) ?? [];
    return resolutions.some((r) => r.kind === 'exact' && r.platform === 'deezer');
  });

  const artists = new Map<string, CorpusArtist>();
  const releaseGroups = new Map<string, CorpusReleaseGroup>();
  const recordingRows: CorpusRecording[] = [];
  const links: CorpusLink[] = [];
  const streamable: StreamableRecording[] = [];

  for (const recording of streamableRecordings) {
    // Preview and cover art are song-level, carried on the exact link that
    // exposed them (Deezer); prefer it, else the first exact link that has them.
    const exact = (resolutionsByRecording.get(recording.recordingId) ?? [])
      .filter((r) => r.kind === 'exact')
      .sort((a, b) => (a.platform === 'deezer' ? -1 : 0) - (b.platform === 'deezer' ? -1 : 0));
    const media = exact.find((r) => r.previewUrl || r.coverArtUrl);
    // The MB core dump has no year; fall back to the platform's release year.
    const year = recording.year ?? exact.find((r) => r.year != null)?.year ?? null;

    artists.set(recording.artistId, {
      id: recording.artistId,
      name: recording.artist,
      country: recording.country,
    });
    releaseGroups.set(recording.releaseGroupId, {
      id: recording.releaseGroupId,
      artistId: recording.artistId,
      title: recording.releaseTitle,
      year,
    });
    recordingRows.push({
      id: recording.recordingId,
      artistId: recording.artistId,
      releaseGroupId: recording.releaseGroupId,
      title: recording.title,
      isrc: recording.isrc,
      durationMs: recording.durationMs,
      year,
      language: recording.language,
      coverArtUrl: media?.coverArtUrl ?? null,
      previewUrl: media?.previewUrl ?? null,
      genres: recording.genres,
    });
    for (const resolution of resolutionsByRecording.get(recording.recordingId) ?? []) {
      links.push({
        recordingId: recording.recordingId,
        platform: resolution.platform,
        url: resolution.url,
        kind: resolution.kind,
        confidence: resolution.confidence,
      });
    }
    streamable.push({
      recordingId: recording.recordingId,
      artistId: recording.artistId,
      releaseGroupId: recording.releaseGroupId,
      genres: recording.genres,
      decade: decadeOf(year),
      country: recording.country,
      language: recording.language,
    });
  }

  return {
    artists: [...artists.values()],
    releaseGroups: [...releaseGroups.values()],
    recordings: recordingRows,
    links,
    weights: buildWeights(streamable),
  };
}
