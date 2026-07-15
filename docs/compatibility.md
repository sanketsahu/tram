# Compatibility — is jetplane a drop-in replacement?

Short answer: **not wholesale, and it doesn't need to be.** jetplane is a caching +
serve layer with two modes. It **augments Metro**; it does **not** replace the Expo CLI
(which also does `install`, `prebuild`, config plugins, EAS, `doctor`, `run`, …).

## Is it a drop-in for the Expo CLI?

- **Cache-plugin mode: yes.** Add one line to `metro.config.js`:
  ```js
  config.transformerPath = require.resolve('jetplane/transformer')
  config.cacheStores = []
  ```
  You keep the entire Expo CLI, Metro, and `expo start`. What changes: a cross-project,
  content-addressed transform cache is injected at Metro's transformer seam, so the same
  vendor module transforms once and is reused across every same-dep project — the
  cold-bundle re-transform of `node_modules` disappears.
- **Thin-serve mode: no.** `jetplane serve` is a separate command that serves a pre-built
  bundle from a ~40 MB no-Metro process (with app-layer HMR). It replaces the dev-server
  *role* for the many-environments/fleet case; it is not a general `expo start`.

## Is it a drop-in for Metro?

No. In cache-plugin mode jetplane **rides on Metro** (it's a `transformerPath`, not a
replacement). In thin-serve mode it does not run Metro at all, but it serves a *pre-built*
bundle plus app-layer HMR — narrower than Metro's full on-demand bundling of any entry
(symbolication, arbitrary asset resolution, etc. are out of scope there).

Why can't Metro's own caching do the cross-project part? Metro's transform-cache keys are
**root-dependent** (they embed the project path), so a second project produces different
keys and re-transforms everything. jetplane keys by **source bytes** (root-independent)
and stores path-normalized output — proven by a second project reusing 99.9% of transforms
instead of doubling the cache. See [architecture.md](./architecture.md) and
[../bench/METRO-CACHESTORE-FINDING.md](../bench/METRO-CACHESTORE-FINDING.md).

## Matrix

| Capability | Metro · `expo start` | jetplane cache plugin | jetplane thin serve |
|---|---|---|---|
| Drop-in with the Expo CLI | yes (it is Metro) | yes (+1 line) | no (separate command) |
| Runs in Expo Go | yes | yes | yes |
| Cross-project transform cache | no (root-dependent keys) | yes | yes |
| Cold-bundle ~2 GB spike | yes | avoided after 1st build | none |
| Per dev-server memory | ~325 MB idle · ~2 GB cold | ~325 MB (rides Metro) | ~40 MB |
| HMR / Fast Refresh | yes | yes | yes (app-layer) |
| Full on-demand bundling / symbolication | yes | yes | partial (pre-built + app-layer HMR) |
| Replaces Metro | — | augments it | serve role only |
| Setup | none | 1 line | build step + serve |
