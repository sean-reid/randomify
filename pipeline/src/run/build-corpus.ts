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
 * Assemble the serving corpus from resolved recordings. Only recordings with at
 * least one exact streaming link are kept (streamable-only); their full link
 * row (exact plus search fallbacks) is preserved so every platform shows.
 */
export function buildCorpusData(
  recordings: readonly NormalizedRecording[],
  resolutionsByRecording: ReadonlyMap<string, Resolution[]>,
): CorpusData {
  const streamableRecordings = recordings.filter((recording) => {
    const resolutions = resolutionsByRecording.get(recording.recordingId) ?? [];
    return resolutions.some((r) => r.kind === 'exact');
  });

  const artists = new Map<string, CorpusArtist>();
  const releaseGroups = new Map<string, CorpusReleaseGroup>();
  const recordingRows: CorpusRecording[] = [];
  const links: CorpusLink[] = [];
  const streamable: StreamableRecording[] = [];

  for (const recording of streamableRecordings) {
    artists.set(recording.artistId, {
      id: recording.artistId,
      name: recording.artist,
      country: recording.country,
    });
    releaseGroups.set(recording.releaseGroupId, {
      id: recording.releaseGroupId,
      artistId: recording.artistId,
      title: recording.releaseTitle,
      year: recording.year,
    });
    recordingRows.push({
      id: recording.recordingId,
      artistId: recording.artistId,
      releaseGroupId: recording.releaseGroupId,
      title: recording.title,
      isrc: recording.isrc,
      durationMs: recording.durationMs,
      year: recording.year,
      language: recording.language,
      coverArtUrl: null,
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
      decade: decadeOf(recording.year),
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
