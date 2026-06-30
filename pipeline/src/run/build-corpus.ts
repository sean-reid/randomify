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

/** Deezer track id from a deezer.com/track/{id} link, for the preview proxy. */
function deezerTrackId(url: string): string | null {
  const match = /deezer\.com\/track\/(\d+)/.exec(url);
  return match ? match[1]! : null;
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
    // Require a Deezer match that actually has a preview: the app is
    // player-first and Deezer-anchored, so a song we cannot play in-app does
    // not belong in the deck.
    return resolutions.some((r) => r.kind === 'exact' && r.platform === 'deezer' && r.previewUrl);
  });

  const artists = new Map<string, CorpusArtist>();
  const releaseGroups = new Map<string, CorpusReleaseGroup>();
  const recordingRows: CorpusRecording[] = [];
  const links: CorpusLink[] = [];
  const streamable: StreamableRecording[] = [];

  for (const recording of streamableRecordings) {
    // Preview, cover art, and year are carried on the Deezer exact link (the
    // corpus requires one). The preview URL itself expires, so store only the
    // stable /preview/{id} proxy path; the API mints a fresh URL at play time.
    const deezerExact = (resolutionsByRecording.get(recording.recordingId) ?? []).find(
      (r) => r.kind === 'exact' && r.platform === 'deezer',
    );
    const trackId = deezerExact ? deezerTrackId(deezerExact.url) : null;
    const previewUrl = deezerExact?.previewUrl && trackId ? `/preview/${trackId}` : null;
    const coverArtUrl = deezerExact?.coverArtUrl ?? null;
    // The MB core dump has no year; fall back to the platform's release year.
    const year = recording.year ?? deezerExact?.year ?? null;

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
      coverArtUrl,
      previewUrl,
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
