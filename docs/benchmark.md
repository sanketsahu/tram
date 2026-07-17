# Benchmark

All numbers are **resident memory of the whole dev-server process tree** (`ps` RSS) on
**Apple Silicon · macOS 15**, or wall-clock bundle time, measured on the same machine.
Harnesses are in [`../bench/`](../bench/); this page consolidates the headline results.

The full case-by-case writeup with charts is on the site:
**<https://sanketsahu.github.io/jetplane/benchmarks>**.

## Method

- **Memory** is split into two series: **idle** (dev server sitting) and **peak** (Metro
  during a cold bundle; the web servers under first load). RSS sampled across the process
  tree via `ps`.
- **Bundle time** is Metro's `iOS Bundled … ms` line, cold vs a different project hitting
  the warm cross-project cache.
- **Cache hit-rate** is the transform worker's own hit/miss telemetry
  (`src/jetplane-transformer.cjs` → `src/jetplane-stats.mjs`), counter reset per bundle.
- Apps are real Expo SDK 54 projects (`bench/expo-app-54*`, expo-router + Reanimated).

## Dev-server memory (MB · lower is better)

Metro's cold bundle runs an order of magnitude past the single-process servers, so it is
shown clipped (†) — on a linear axis it would flatten everything else.

| dev server | idle | peak | notes |
|---|---:|---:|---|
| **jetplane** (thin serve, no Metro) | **40** | **68** | mmap'd pre-built bundle; no per-project Metro |
| Metro (Expo) | 325 | **2,018 †** | cold bundle spikes ~2 GB, holds a ~700 MB floor |
| Vite (web) | 255 | 255 | lazy on-demand ESM; no monolithic bundle |
| Next.js (web, Turbopack) | 851 | 853 | route compiled on demand |

† off the axis — a transient cold-bundle spike, not a steady value.

## Case 1 — Cross-project cache (3 separate SDK-54 projects, same deps)

| project | modules | bundle time | hit-rate |
|---|---:|---:|---:|
| A (cold — builds cache) | 1,442 | 4,973 ms | — |
| B | 1,442 | 1,710 ms | **1,440 / 1,442 = 99.9%** |
| **C** | 1,442 | **1,799 ms** | **1,440 / 1,442 = 99.9%** |

The ~2.8× speedup (4,973 → 1,799 ms) is *explained by the hit count*: 99.9% of transforms
never ran. Only the 2 modules that genuinely differ per project were misses. Each app is wired
the way `jetplane init` writes `metro.config.js` (jetplane's worker chained over Expo's default
transformer) — the path that must stay root-independent. Reproduce: `node bench/xproject-hitrate.mjs`.

## Case 2 — Installing a new package (incremental cache + thin vs Metro memory)

Three identical apps, shared cache built cold by `proj-a`. `proj-b` installs + imports one unique
package (`ms`), `proj-c` a different one (`dayjs`). Installing a package does **not** rebuild the
`node_modules` transform cache — only the new package (plus the app file that imports it) is a miss.

| project | unique pkg | modules | hits | misses | hit-rate | bundle time |
|---|---|---:|---:|---:|---:|---:|
| proj-a | — | 1,442 | 0 | 1,442 | — (cold) | 3,122 ms |
| proj-b | `ms` | 1,443 | 1,440 | **3** | 99.8% | 1,333 ms |
| proj-c | `dayjs` | 1,443 | 1,440 | **3** | 99.8% | 1,114 ms |

The 3 misses are exactly: the new package (`node_modules/ms/index.js`), the edited screen, and
expo-router's generated route module (re-hashes because app source changed). No other
`node_modules` module runs.

Same three projects, **normal Metro dev server vs jetplane thin serve** (memory, MB):

| project | Metro idle | Metro peak | thin idle | thin peak | thin (bun only) |
|---|---:|---:|---:|---:|---:|
| proj-a | 654 | **2,965** | 139 | **156** | 108 |
| proj-b (+ms) | 658 | 1,612 | 140 | 156 | 108 |
| proj-c (+dayjs) | 657 | 1,561 | 140 | 156 | 108 |

thin serve is flat (~140 idle / 156 peak) regardless of project or added package — it serves a
pre-built mmap'd bundle, so no transform happens at serve time. Idle ~4.7× lighter; peak ~10×
(warm) to ~19× (cold) lighter. Caveat: the thin peak is steady-state; a new package triggers a
one-time image rebuild (a Metro build, ~1.6 GB transient) before settling back to ~108 MB.

## Bounded memory & boot (vendor cache prototype, 995 real modules)

| metric | jetplane | Metro |
|---|---:|---:|
| cold transform (build, once) | 303 MB peak | — |
| warm packed boot | **0.38 ms** | ~3,130 ms cold bundle |
| per-project warm boot memory | +13 MB | — |
| shared store on disk | 3–10 MB (all projects) | 539 MB node_modules / project |

## Fleet cost model

- **jetplane:** ~40–55 MB × N + one shared transform service (~150 MB, once)
- **Metro:** ~325 MB × N idle · ~2,018 MB × N during cold bundles

For 24 environments: **~1.4 GB (jetplane)** vs **~7.8 GB idle / up to ~48 GB spiking (Metro)**.
The OOM trigger on a fleet node is a burst of concurrent cold bundles — jetplane removes it.

## On device

Validated in Expo Go on a real iPhone (SDK 54): boots from the thin no-Metro server, and
**live HMR works** — an edit hot-swaps the screen via React Refresh, no reload. See
[../bench/ON-DEVICE-VALIDATION.md](../bench/ON-DEVICE-VALIDATION.md) and
[../bench/MEMORY-FUSION.md](../bench/MEMORY-FUSION.md).
