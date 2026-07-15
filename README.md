# Tram

Research toward a low-footprint dev/bundling toolchain for **Expo/React Native** (and
Vite), built for running **many dev environments per machine** in a cloud fleet — where
Metro's memory and cold-bundle cost dominate.

The core idea, validated end-to-end on a real device:

- **node_modules is ~98.5% dead weight** for a given app (measured: ~8 MB reachable of
  539 MB). Split the immutable **vendor** layer from the mutable **app** layer.
- **Content-address transforms by source bytes** (root-independent) so the *same* module
  transforms once and is reused across *different* projects — the cross-project cache
  Metro's own (root-dependent) cache cannot provide.
- **Serve a pre-built bundle from a thin, no-Metro process** (`mmap`'d), with **HMR**
  reconstructed from parsing the bundle + Metro's HMR protocol.

## Benchmark

Resident memory of the whole dev-server process tree (`ps` RSS), Apple Silicon · macOS 15.
Full methodology + harnesses: [docs/benchmark.md](docs/benchmark.md) · [bench/](bench/).

### Dev-server memory — MB, lower is better

```
                        0        250       500       750      1000
tram (thin, no Metro)
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
| **tram** (thin serve, no Metro) | **40 MB** | **68 MB** |
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

- **tram:** ~40–55 MB × N + one shared transform service (~150 MB, once)
- **Metro:** ~325 MB × N idle · ~2,018 MB × N during cold bundles

For 24 environments: **~1.4 GB (tram)** vs **~7.8 GB idle / up to ~48 GB spiking (Metro)**.

Validated end-to-end on a real device (Expo Go, SDK 54): boots from the thin no-Metro
server, **live HMR working**.

## Website & docs

- Landing page + interactive benchmark chart: [`website/`](website/) (Next.js + shadcn/radix + Tailwind)
- Documentation: [`docs/`](docs/) — [getting started](docs/getting-started.md) · [architecture](docs/architecture.md) · [benchmark](docs/benchmark.md)

## Layout

- `src/` — the tram tooling: CLI, custom Metro transformer worker (cross-project cache),
  transform service, serializer, thin dev server, HMR.
- `bench/` — measurement harnesses + findings (`*.md`) and scaffolded test apps.
- Design docs: `GOAL.md`, `FIRST-PRINCIPLES.md`, `CACHE-MODEL.md`, `SHARED-CACHE.md`,
  `ARCHITECTURE.md`, and the measured results in `bench/*.md`.

## Status

Research WIP. The measurements and the on-device HMR demo are real; productionization
(clean `tram build`/`serve`/`dev` commands, shared-service HMR transforms, full
import-change handling, cache-vary for env) is ongoing. Absolute paths in some configs
are machine-specific to the author's setup.

Not affiliated with or endorsed by Meta, Expo, or the React Native team.
