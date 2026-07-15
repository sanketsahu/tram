# Jetplane documentation

Low-footprint dev/bundling toolchain for Expo/React Native (and Vite), built for running
many dev environments per machine. Everything here is measured; the on-device HMR demo is
real. Research WIP.

## Start here

| Doc | What it covers |
|---|---|
| [getting-started.md](./getting-started.md) | Run the tooling, reproduce the on-device HMR demo |
| [architecture.md](./architecture.md) | The vendor/app split, cross-project cache, thin server, HMR — how it fits together |
| [compatibility.md](./compatibility.md) | Is it a drop-in for the Expo CLI / Metro? The two modes + comparison matrix |
| [benchmark.md](./benchmark.md) | Methodology + full measured results (the numbers on the site) |

## The design record (deep dives, in the order they were reasoned out)

These are the working documents behind the design — each is a self-contained argument.

| Doc | Question it answers |
|---|---|
| [../GOAL.md](../GOAL.md) | What are we solving and why (memory + disk of a dev fleet) |
| [../FIRST-PRINCIPLES.md](../FIRST-PRINCIPLES.md) | Why node_modules is ~98.5% dead weight; the immutable/mutable split |
| [../CACHE-MODEL.md](../CACHE-MODEL.md) | Invalidation: installs, new tree-traces, the two hashmaps, base + increments |
| [../SHARED-CACHE.md](../SHARED-CACHE.md) | Distributing the cache (local → org → global CDN); reproducibility & trust |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | The converged design: one tool, framework adapters, no daemon |

## Measured results (raw)

Under [../bench/](../bench/):

| Doc | Result |
|---|---|
| [bench/RESULTS.md](../bench/RESULTS.md) | Metro vs Vite vs Next memory; Metro's 2 GB cold spike, decay, N-concurrent curve |
| [bench/FIRST-PRINCIPLES-style composition analysis] · [bench/METRO-PORTABILITY.md](../bench/METRO-PORTABILITY.md) | Vendor transforms are content-addressable across project roots (gate: pass) |
| [bench/METRO-CACHE-RESULTS.md](../bench/METRO-CACHE-RESULTS.md) | Cross-project vendor cache: 99.9% hits, bounded memory, sub-ms packed boot |
| [bench/PATH2-FINDINGS.md](../bench/PATH2-FINDINGS.md) | Thin server ~40–55 MB; babel is the real per-project hog → shared service |
| [bench/METRO-CACHESTORE-FINDING.md](../bench/METRO-CACHESTORE-FINDING.md) | Why Metro's own cache can't do cross-project (root-dependent keys) |
| [bench/SERIALIZER.md](../bench/SERIALIZER.md) | Executable serializer + stable content-hash IDs + app/vendor boundary |
| [bench/MEMORY-FUSION.md](../bench/MEMORY-FUSION.md) | Thin serve of the pre-built bundle to Expo Go; HMR on device |
| [bench/ON-DEVICE-VALIDATION.md](../bench/ON-DEVICE-VALIDATION.md) | 3 projects, 99.9% cross-project hit-rate, on real hardware |

## Website

The landing page + interactive benchmark chart live in [../website/](../website/)
(Next.js + shadcn/radix + Tailwind).
