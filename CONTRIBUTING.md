# Contributing

## Branches, deploys, releases

`dev` is the only long-lived branch. Feature branches open PRs against it, and
every merge deploys the dev environment.

release-please watches `dev` and keeps a release PR open that bumps the version
and writes the changelog from the conventional commits since the last release.
Merging that PR is the release: the run tags `vX.Y.Z`, publishes the GitHub
Release, deploys that commit to staging, checks its `/health` reports the same
commit, then deploys production behind the production environment's approval.

There is nothing to promote by hand. To ship, merge the release PR. To hold
production back, leave it open.

## Commits

Use [conventional commits](https://www.conventionalcommits.org) - `feat:`,
`fix:`, `chore:`, `docs:`, `refactor:`, `test:`, etc. release-please reads them
to generate the changelog and pick the next semver version. Use `feat!:` or a
`BREAKING CHANGE:` footer for breaking changes.

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
