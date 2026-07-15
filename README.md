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

## Results (measured)

| | result |
|---|---|
| cross-project cache hit-rate (3 separate SDK-54 projects) | **99.9%** (1440/1442) |
| bundle time, cold → cross-project-warm | **3205 ms → 753 ms** (~4.3×) |
| thin dev server memory | **~40–68 MB** vs Metro ~325 MB idle / ~2 GB cold |
| on device (Expo Go) | **boots + live HMR working, no Metro running** |

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
