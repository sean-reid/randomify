# Changelog

## [0.2.0](https://github.com/sean-reid/randomify/compare/v0.1.0...v0.2.0) (2026-06-30)


### Features

* **api:** deep /health check that verifies the corpus is reachable ([#46](https://github.com/sean-reid/randomify/issues/46)) ([81906e7](https://github.com/sean-reid/randomify/commit/81906e74db397dd33fc9afb55839f4fd59624292))
* **api:** mint Deezer previews on demand via a /preview proxy ([#40](https://github.com/sean-reid/randomify/issues/40)) ([2169206](https://github.com/sean-reid/randomify/commit/216920681a01279daa70c400c85dc6e1fbbf786c))
* branch-per-environment CD, release-please, explicit API base ([#17](https://github.com/sean-reid/randomify/issues/17)) ([9eab663](https://github.com/sean-reid/randomify/commit/9eab6634a76a60b66833b00c32159c033c6b7506))
* **cron:** install tooling, staging plist, and local run records ([#61](https://github.com/sean-reid/randomify/issues/61)) ([b144330](https://github.com/sean-reid/randomify/commit/b1443308b22c1f0a83d1b57bcc85a3f53fc0b3b1))
* in-app preview player ([#38](https://github.com/sean-reid/randomify/issues/38)) ([e442789](https://github.com/sean-reid/randomify/commit/e442789a2b4129bf2db060883cc6a55c2934c190))
* MusicBrainz core-dump extraction + local catalog load ([#22](https://github.com/sean-reid/randomify/issues/22)) ([39c4413](https://github.com/sean-reid/randomify/commit/39c44130b12850e00d92ddd8ddbd13c152fbe1fa))
* persistent Postgres resolution cache ([#21](https://github.com/sean-reid/randomify/issues/21)) ([603f274](https://github.com/sean-reid/randomify/commit/603f274f59beaef3c1b0985c4eac55414c619a1d))
* **pipeline:** cron jobs for incremental load with health monitoring ([#37](https://github.com/sean-reid/randomify/issues/37)) ([ffeabeb](https://github.com/sean-reid/randomify/commit/ffeabeb9815dba92eae099b2b7ff8a9f5942177c))
* **pipeline:** exact streaming links from MusicBrainz URL relationships ([#49](https://github.com/sean-reid/randomify/issues/49)) ([1182ef8](https://github.com/sean-reid/randomify/commit/1182ef8affd02a7c9439f5f7703a9b79ff0f0969))
* **pipeline:** extract genres and canonical year from the derived dump ([#43](https://github.com/sean-reid/randomify/issues/43)) ([55a9a2b](https://github.com/sean-reid/randomify/commit/55a9a2bba4e1d599c239952fcfea1377476fadd5))
* **pipeline:** incremental resolve-from-backlog + corpus upsert ([#35](https://github.com/sean-reid/randomify/issues/35)) ([d6c1a44](https://github.com/sean-reid/randomify/commit/d6c1a4406dfc00a83439390e05bb00083fcda15f))
* **pipeline:** rate-limit resolver HTTP and batch the resolution cache ([#33](https://github.com/sean-reid/randomify/issues/33)) ([f4c0a84](https://github.com/sean-reid/randomify/commit/f4c0a843dd3e681b59c72f5cdbd99289249aae93))
* **pipeline:** recording backlog data layer ([#34](https://github.com/sean-reid/randomify/issues/34)) ([3ed54df](https://github.com/sean-reid/randomify/commit/3ed54df1ecedaceec9b31382312f15c82785c3c6))
* **pipeline:** weight-rebuild job ([#36](https://github.com/sean-reid/randomify/issues/36)) ([a4c51f2](https://github.com/sean-reid/randomify/commit/a4c51f23968789ada71fa9e7b9dc49d75949f517))
* player polish — reliable autoplay, fades, cover sync, Deezer-only corpus ([#39](https://github.com/sean-reid/randomify/issues/39)) ([6396a5d](https://github.com/sean-reid/randomify/commit/6396a5d720fdb5f0a70d4547edf4713604e0de68))
* **web:** more distinct vinyl-and-play favicon ([#31](https://github.com/sean-reid/randomify/issues/31)) ([1ecb0a8](https://github.com/sean-reid/randomify/commit/1ecb0a82ab5d4b2793d06a361d45cabdee7ba5d1))


### Bug Fixes

* add wrangler to the web package for Pages deploys ([#19](https://github.com/sean-reid/randomify/issues/19)) ([4a74102](https://github.com/sean-reid/randomify/commit/4a741028cc8e22cb3d80ee285e49127eeaa42288))
* **api:** audit fixes - reuse DB connection, clamp walk, harden /preview ([#51](https://github.com/sean-reid/randomify/issues/51)) ([fd2b6e1](https://github.com/sean-reid/randomify/commit/fd2b6e19c4bdb0a875daad5706e156f32bee3e49))
* **api:** pass spin array params as split strings, not bound arrays ([#56](https://github.com/sean-reid/randomify/issues/56)) ([456a6d8](https://github.com/sean-reid/randomify/commit/456a6d8b89da51fec7aa7562d05731962ffb31c7))
* **api:** revert per-request DB connection (Workers can't reuse I/O cross-request) ([#52](https://github.com/sean-reid/randomify/issues/52)) ([0d37093](https://github.com/sean-reid/randomify/commit/0d37093d854d5451401575bb30786c1b4deb7fe7))
* genres from core dump + playable-only (Deezer preview required) ([#47](https://github.com/sean-reid/randomify/issues/47)) ([a9f31f5](https://github.com/sean-reid/randomify/commit/a9f31f5c9de8c7b7e5575bc8e352a7c20e512a49))
* harden pipeline + cron scripts, drop dead scheduled-pipeline path ([#53](https://github.com/sean-reid/randomify/issues/53)) ([e838245](https://github.com/sean-reid/randomify/commit/e8382453b7cc38795cda287d9c14f56b7d75c515))
* hide the space-key hint on touch devices ([#23](https://github.com/sean-reid/randomify/issues/23)) ([ec1cf6c](https://github.com/sean-reid/randomify/commit/ec1cf6c36f4f255d23797a2e549b35b2ee216531))
* **pipeline:** balance the backlog across eras, not just recency ([#62](https://github.com/sean-reid/randomify/issues/62)) ([aa52afb](https://github.com/sean-reid/randomify/commit/aa52afbdd24c9d1e21fd94619ec02b64e7e1a2b0))
* **pipeline:** correct MB columns, tolerate missing tables, add extract limit ([#32](https://github.com/sean-reid/randomify/issues/32)) ([11578c8](https://github.com/sean-reid/randomify/commit/11578c87060bd31a201b8bad69260ce21725f01a))
* **pipeline:** drop stray NUL byte in the resolution-cache key ([#58](https://github.com/sean-reid/randomify/issues/58)) ([5007e81](https://github.com/sean-reid/randomify/commit/5007e816af2c1c0629e0b091e3b71769147ab930))
* sanity-check ISRC matches to reject wrong songs ([#20](https://github.com/sean-reid/randomify/issues/20)) ([a48a72f](https://github.com/sean-reid/randomify/commit/a48a72fcfbb2909a42405e81e3b6588fcf20c32f))
* **scripts:** portable mkdir lock so cron jobs run on macOS ([#44](https://github.com/sean-reid/randomify/issues/44)) ([d094974](https://github.com/sean-reid/randomify/commit/d094974c4df00a595d9152c6ca9d2cdd29280aa2))
* **web:** audit fixes - a11y, fade-timer leak, error-state, swipe, robustness ([#50](https://github.com/sean-reid/randomify/issues/50)) ([e8196b9](https://github.com/sean-reid/randomify/commit/e8196b9b0124f67eecef08c767291d529afb9d22))
* **web:** center the prev/next controls with SVG chevron icons ([#45](https://github.com/sean-reid/randomify/issues/45)) ([d368918](https://github.com/sean-reid/randomify/commit/d368918eba51261f5199f4bd8ffd95910c8c4224))
* **web:** preflight previews so dead ones never flash into the deck ([#42](https://github.com/sean-reid/randomify/issues/42)) ([170404c](https://github.com/sean-reid/randomify/commit/170404c1739405cb5d290eb9b030a0611aca7758))
* **web:** robust playback - prime autoplay, continuous play, skip dead previews ([#41](https://github.com/sean-reid/randomify/issues/41)) ([79a10b7](https://github.com/sean-reid/randomify/commit/79a10b71fa07d1d8fbf5851079992be82794b0bd))


### Performance Improvements

* **api:** resolve a spin in one DB round trip ([#54](https://github.com/sean-reid/randomify/issues/54)) ([785e7d4](https://github.com/sean-reid/randomify/commit/785e7d4322b7bb21c75aa79d5c17920f5f5d2372))
* **pipeline:** bulk-load with array-bound unnest inserts ([#57](https://github.com/sean-reid/randomify/issues/57)) ([fd7e398](https://github.com/sean-reid/randomify/commit/fd7e398b2c894d057860866767feccb0c94a4b07))
* **pipeline:** pool load DB access with pinned transactions ([#59](https://github.com/sean-reid/randomify/issues/59)) ([ae1367d](https://github.com/sean-reid/randomify/commit/ae1367d904b6caff5a373679d49a16d270630576))

## Changelog

All notable changes to randomify are documented here. Versions follow
[semantic versioning](https://semver.org), and entries are generated from
[conventional commits](https://www.conventionalcommits.org) by release-please
when changes reach the production branch.
