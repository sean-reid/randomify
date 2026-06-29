# randomify

Discover music through true randomness. randomify samples a song from a deep
corpus of published music and hands you the links to play it on every major
streaming service.

No recommendations, no curation, no algorithm tuned to keep you listening to
what you already like. Just a fair shot at anything ever recorded.

## How it works

The corpus is built from MusicBrainz and filtered to recordings that resolve to
at least one streaming platform. Each spin walks a weighted hierarchy (genre,
era, region, artist, release, recording) so that prolific artists and crowded
genres do not drown out everything else. The result is a single song and a row
of buttons: Spotify, Apple Music, YouTube Music, Tidal, Deezer, Amazon Music,
Pandora, and Bandcamp.

## Project layout

This is a pnpm + Turbo monorepo.

| Path              | What it is                                        |
| ----------------- | ------------------------------------------------- |
| `apps/web`        | SvelteKit frontend (Cloudflare Pages)             |
| `apps/api`        | TypeScript Worker serving the sampler             |
| `pipeline`        | Corpus build: MusicBrainz ingest, link resolution |
| `packages/shared` | Shared types, platform registry, sampler core     |

## Development

```bash
pnpm install
pnpm dev
```

Requires Node 24 and pnpm 10.
