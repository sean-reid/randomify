import { PLATFORMS, searchLink, type SpinResponse } from '@randomify/shared';

/** A deterministic spin response so the UI tests are stable. */
export const SAMPLE_SPIN: SpinResponse = {
  facet: 'genre',
  song: {
    recordingId: 'test-rec-001',
    title: 'Paranoid Android',
    artist: 'Radiohead',
    artistId: 'test-art-radiohead',
    releaseTitle: 'OK Computer',
    releaseGroupId: 'test-rg-okcomputer',
    year: 1997,
    isrc: null,
    durationMs: 383000,
    coverArtUrl: null,
    // A tiny silent WAV so the player actually loads and plays in the headless
    // browser without a network dependency.
    previewUrl:
      'data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==',
    genres: ['rock', 'alternative'],
  },
  links: PLATFORMS.map((p) => searchLink(p.id, 'Radiohead', 'Paranoid Android')),
};
