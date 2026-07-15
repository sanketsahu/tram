# On-device validation (Expo Go, SDK 54) — cross-project cache CONFIRMED

Two separate Expo SDK 54 projects, same deps, both using the Jetplane custom transformer
worker (`src/jetplane-transformer.cjs`) via `metro.config.js`. Bundled on a real iPhone
through Expo Go.

## Result

| project | modules | bundle time | note |
|---|---:|---:|---|
| **A** (`expo-app-54`) | 1436 | **3205 ms** | cold — populated `~/.jetplane/tstore` |
| **B** (`expo-app-54-b`) | 1434 | **928 ms** | different project, same deps -> cache HITS |
| B incremental (Fast Refresh) | 1 | 23 ms | HMR working |

**~3.5x faster** for a genuinely separate project with the same module count. Project B's
Metro was a fresh process (no in-memory cache), so the speedup is **cross-project
disk-cache reuse** of the ~1,400 vendor transforms — exactly the goal.

## Precise cache attribution (Project C, instrumented worker)

Third separate SDK 54 project, same deps, one screen edited (title). Worker hit/miss
telemetry (`src/jetplane-stats.mjs`), counter reset before the bundle:

| project | modules | bundle time | hit-rate |
|---|---:|---:|---:|
| A (cold, built cache) | 1436 | 3205 ms | — |
| B | 1434 | 928 ms | — |
| **C** | 1415 | **753 ms** | **1440/1442 = 99.9%** |

Only **2 misses** — exactly the modules that genuinely differ in C (the edited title
screen + one generated/entry module). Everything else was served from the shared cache.
The **4.3x wall-clock speedup (3205 -> 753 ms) is fully explained**: 99.9% of transforms
never ran. Cross-project reuse across THREE separate projects, quantified, on real hardware.

## What this confirms

- The Jetplane custom-transformer-worker approach delivers **cross-project transform caching
  inside Expo's real, device-bootable Metro pipeline** — validated on hardware, not just
  in isolation.
- Boots and runs in Expo Go (SDK 54); Fast Refresh works (23 ms / 1 module).
- Metro's own caching cannot do this (root-dependent keys); our root-independent
  content-addressed worker can.

## Honest notes

- Absolute times include app-layer transforms + serialization; the vendor portion is the
  cache-hit part. A even-cleaner measure would log hit/miss counts from the worker.
- Expo Go on the phone was 56.0.3; installing the recommended 54.0.7 for SDK 54 worked.
- This validates the cross-project CACHE + device boot. The separate path-2 thin-server
  MEMORY win (40 MB) is proven in isolation but not yet fused with this device path; the
  finish line remains: pre-build via the worker cache, serve via the thin server.
