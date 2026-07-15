# jetplane

**A Metro plugin and a lightweight dev server for Expo & React Native** — built for
running many dev environments per machine. Drop one line into `metro.config.js` and every
same-dep project shares one transform cache, so cold bundles stop re-transforming
`node_modules`. Each dev environment costs ~40 MB instead of Metro's ~325 MB idle / ~2 GB cold.

Open source (MIT) · on npm as [`jetplane`](https://www.npmjs.com/package/jetplane).

The core idea, validated end-to-end on a real device:

- **node_modules is ~98.5% dead weight** for a given app (measured: ~8 MB reachable of
  539 MB). Split the immutable **vendor** layer from the mutable **app** layer.
- **Content-address transforms by source bytes** (root-independent) so the *same* module
  transforms once and is reused across *different* projects — the cross-project cache
  Metro's own (root-dependent) cache cannot provide.
- **Serve a pre-built bundle from a thin, no-Metro process** (`mmap`'d), with **HMR**
  reconstructed from parsing the bundle + Metro's HMR protocol.

## Quick start

Add jetplane to an existing Expo project (SDK 54+, Node 20+). No workflow change — keep
using `expo start`.

```bash
npm install jetplane
npx jetplane init       # wires the transform cache into metro.config.js
npx expo start          # your normal flow — now cross-project cached
```

`jetplane init` adds two lines to your Metro config:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.transformerPath = require.resolve('jetplane/transformer') // the Metro plugin
config.cacheStores = []                                          // jetplane owns caching

module.exports = config
```

The first bundle populates a shared, content-addressed cache under `~/.jetplane`; every
other same-dep project (and every restart) reuses it.

## Is it a drop-in replacement?

**Not wholesale — and it doesn't need to be.** jetplane is a caching + serve layer with
two modes. It **augments Metro**; it does **not** replace the Expo CLI.

- **Cache plugin** — one line in `metro.config.js` (`config.transformerPath =
  require.resolve('jetplane/transformer')`). You keep the entire Expo CLI + Metro and
  `expo start`, and gain a cross-project transform cache (no more cold-bundle re-transform
  of node_modules). Fully drop-in.
- **Thin serve** (experimental) — serves a pre-built bundle from a ~40 MB no-Metro process
  with app-layer HMR. Replaces the dev-server *role* for the many-environments case.

| Capability | Metro · `expo start` | jetplane cache plugin | jetplane thin serve |
|---|---|---|---|
| Drop-in with the Expo CLI | ✓ (it *is* Metro) | ✓ (+1 line) | ✗ (separate command) |
| Runs in Expo Go | ✓ | ✓ | ✓ |
| Cross-project transform cache | ✗ (root-dependent keys) | ✓ | ✓ |
| Cold-bundle ~2 GB spike | yes | avoided after 1st build | none |
| Per dev-server memory | ~325 MB idle · ~2 GB cold | ~325 MB (rides Metro) | **~40 MB** |
| HMR / Fast Refresh | ✓ | ✓ | ✓ (app-layer) |
| Full on-demand bundling / symbolication | ✓ | ✓ | partial (pre-built + app-layer HMR) |
| Replaces Metro | — | augments it | serve role only |
| Setup | none | 1 line | build step + serve |

## Benchmark

Resident memory of the whole dev-server process tree (`ps` RSS), Apple Silicon · macOS 15.
Full methodology + harnesses: [docs/benchmark.md](docs/benchmark.md) · [bench/](bench/).

### Dev-server memory — MB, lower is better

```
                        0        250       500       750      1000
jetplane (thin, no Metro)
  idle   40  ▇
  peak   68  ▇▇
Metro (Expo)
  idle  325  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇
  peak 2018  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇⟩  (off axis — cold-bundle spike)
Vite (web)
  idle  255  ▇▇▇▇▇▇▇▇▇▇▇
  peak  255  ▇▇▇▇▇▇▇▇▇▇▇
Next.js (web)
  idle  851  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
  peak  853  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
```

| dev server | idle | peak |
|---|---:|---:|
| **jetplane** (thin serve, no Metro) | **40 MB** | **68 MB** |
| Metro (Expo) | 325 MB | **2,018 MB** (cold-bundle spike) |
| Vite (web) | 255 MB | 255 MB |
| Next.js (web, Turbopack) | 851 MB | 853 MB |

### Cross-project cache — 3 separate SDK-54 projects, same deps

| project | modules | bundle time | cache hit-rate |
|---|---:|---:|---:|
| A (cold — builds the cache) | 1,436 | 3,205 ms | — |
| B | 1,434 | 928 ms | — |
| **C** (instrumented) | 1,415 | **753 ms** | **1,440 / 1,442 = 99.9%** |

The **4.3× speedup** (3,205 → 753 ms) is explained by the hit count — 99.9% of transforms
never ran. Warm packed boot is **0.38 ms** (vs Metro's ~3,130 ms cold bundle).

### Fleet cost model

- **jetplane:** ~40–55 MB × N + one shared transform service (~150 MB, once)
- **Metro:** ~325 MB × N idle · ~2,018 MB × N during cold bundles

For 24 environments: **~1.4 GB (jetplane)** vs **~7.8 GB idle / up to ~48 GB spiking (Metro)**.

Validated end-to-end on a real device (Expo Go, SDK 54): boots from the thin no-Metro
server, **live HMR working**.

## Website & docs

- Landing page + interactive benchmark chart: [`website/`](website/) (Next.js + shadcn/radix + Tailwind)
- Documentation: [`docs/`](docs/) — [getting started](docs/getting-started.md) · [architecture](docs/architecture.md) · [benchmark](docs/benchmark.md)

## Layout

- `src/` — the jetplane tooling: CLI, custom Metro transformer worker (cross-project cache),
  transform service, serializer, thin dev server, HMR.
- `bench/` — measurement harnesses + findings (`*.md`) and scaffolded test apps.
- Design docs: `GOAL.md`, `FIRST-PRINCIPLES.md`, `CACHE-MODEL.md`, `SHARED-CACHE.md`,
  `ARCHITECTURE.md`, and the measured results in `bench/*.md`.

## Status

Open source (MIT), on npm. **Shipping today:** the Metro plugin (cross-project transform
cache), drop-in with `expo start`, measured at a 99.9% cross-project hit-rate on device.
**Experimental:** the thin no-Metro dev server + HMR. **Roadmap:** multi-level new-dep +
deletion handling in HMR, shared-service HMR transforms, the 0.2% worklet
path-normalization gap, app-layer cache-vary for env, and a first-class `jetplane serve`.

Contributions welcome. Not affiliated with or endorsed by Meta, Expo, or the React Native team.
