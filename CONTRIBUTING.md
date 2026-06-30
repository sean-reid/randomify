# Contributing

## Branches and environments

Three long-lived branches map to the three environments:

- **`dev`** - the default branch. Feature branches open PRs here; merging deploys
  the dev environment.
- **`staging`** - promote `dev` here (fast-forward) to deploy staging.
- **`production`** - promote `staging` here to deploy production (gated on
  approval).

Promote with fast-forward merges so commit history carries through cleanly:

```bash
git checkout staging && git merge --ff-only dev && git push
git checkout production && git merge --ff-only staging && git push
```

## Commits

Use [conventional commits](https://www.conventionalcommits.org) - `feat:`,
`fix:`, `chore:`, `docs:`, `refactor:`, `test:`, etc. release-please reads them
to generate the changelog and pick the next semver version when changes reach
`production`. Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.

## Before opening a PR

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

## Loading the catalog (local, one-time)

The full MusicBrainz catalog is too large for CI, so the initial load runs
locally and writes the streamable corpus to a Neon branch. Afterwards the cheap
incremental resolver keeps it growing.

1. Download the latest MusicBrainz core dump (`mbdump.tar.bz2`) and extract the
   needed tables into a directory:
   ```bash
   tar xjf mbdump.tar.bz2 mbdump/recording mbdump/isrc mbdump/artist \
     mbdump/artist_credit_name mbdump/track mbdump/medium mbdump/release \
     mbdump/release_group mbdump/release_group_meta mbdump/area mbdump/language
   ```
2. Build and run the load against the target Neon branch:
   ```bash
   pnpm --filter @randomify/pipeline build
   MB_DUMP_DIR=./mbdump DATABASE_URL='<neon-connection-string>' \
     pnpm --filter @randomify/pipeline load:musicbrainz
   ```

It extracts ISRC-bearing recordings, resolves links (cached in Neon), and
exports the streamable corpus. `LIMIT=N` caps how many recordings to resolve in
one pass.
