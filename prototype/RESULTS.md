# Cache prototype results (Vite testbed)

Content-addressed transform cache over the **real** vite-app module graph, plus a
resident multi-tenant memory sim. Transformer: esbuild 0.28 (web). This is the Vite-first
slice; the mechanism ports to RN/Metro next. Run with `node cache-bench.mjs` and
`node --expose-gc resident-sim.mjs <N> <naive|shared>`.

## 1. Build / boot time + cache-bust (cache-bench.mjs)

Graph: 20 modules (3 app / 17 vendor). Numbers are server-side "produce the servable
image" time.

| state | time | what happened |
|---|---:|---|
| **cold** | 54.6 ms | transform all 20 modules, populate store |
| **warm** | 5.5 ms | every module a cache HIT (per-file store) + assemble |
| **packed** | **0.28 ms** | read ONE base-image file (mmap-style boot) |
| **edit-1** (bust) | 0.76 ms | 1 app file changed → 1 re-hash + re-transform |
| **add-1** (bust) | 1.81 ms | reach 1 new vendor module (new tree-trace) → transform 1 |

- **Boot from warm packed cache: 0.28 ms** — 195× faster than cold, in the
  microsecond-to-1ms range you asked for.
- **Cache-bust is O(changed modules), not O(graph):** editing a file or reaching a new
  module costs ~1-2 ms, because content addressing means only the changed hash misses.

## 2. Disk

| | size | scope |
|---|---:|---|
| shared content-addressed store | 2 MB (22 entries) | **shared across ALL envs** |
| vite-app/node_modules | 85 MB | **per env today** |

## 3. Marginal memory per environment (resident-sim.mjs, N=500)

The fleet metric. One resident process boots 500 envs two ways:

| mode | RSS grew (500 envs) | **per-env marginal** |
|---|---:|---:|
| **naive** (each env holds its own vendor image — Metro-like) | 769.9 MB | **1,577 KB** |
| **shared** (one base image buffer, envs reference it + app delta) | 2.0 MB | **4.1 KB** |

**~385× less memory per environment** when the base image is shared. 500 envs cost 2 MB
of marginal memory instead of 770 MB. This is the direct answer to the measured
"0.7-2.0 GB × N" Metro curve: with sharing, the vendor mass is counted **once**, and N
scales on the app delta only.

## 4. Scale test — heavy-app, 12,823 modules

Real dependency surface (`@mui/material` + `@mui/icons-material` + `lodash-es` +
`date-fns` + `rxjs`). node_modules 328 MB / ~130 MB apparent.

| state | time | note |
|---|---:|---|
| **cold** | 4,036 ms | transform all 12,823 modules |
| **warm** (per-file store) | 320 ms | 12,823 cache hits — but 12.8k file reads is the cost |
| **packed** | **1.36 ms** | one 10.7 MB image read (mmap-style boot) |
| **edit-1** (bust) | 2.16 ms | 1 app file → 1 transform |
| **add-1** (bust) | 2.68 ms | 1 new vendor module → 1 transform |

- **Boot is ~independent of graph size: 0.28 ms at 20 modules, 1.36 ms at 12,823.**
  Because a packed boot is one file read, not a graph walk. Cold→packed = **2,963×**.
- **Cache-bust stays O(changed), ~2 ms**, even against a 13k-module graph.
- **Warm-per-file (320 ms) vs packed (1.36 ms)** is the architectural lesson: reading
  12.8k individual store files is slow; the base image MUST be packed into one
  mmap-able blob. The per-file store is only the populate/increment format.
- **Disk: 10 MB shared store vs 130-328 MB node_modules per env.**

### Marginal memory per env at scale (10.7 MB image, N=200)

| mode | RSS grew (200 envs) | per-env |
|---|---:|---:|
| **naive** (own image per env — Metro-like) | 2,106 MB | 10,786 KB |
| **shared** (one image, referenced) | 10.8 MB | 55 KB |

**~195× less memory per env.** 200 envs: **2.1 GB → 11 MB.** The naive column *is* the
"~2 GB for a handful of envs" Metro reality we measured in `bench/RESULTS.md`; sharing
the base image collapses it to roughly one image total, regardless of N.

## Honest caveats

- **Small graph.** vite-app is trivial (20 modules; react-dom prebundles into few files).
  Real apps are larger, so absolute times grow — but the *deltas* (195× boot, O(changed)
  bust, 385× memory) are structural, not scale-dependent. Scale test with a real app is
  the next step.
- **Web transform, not RN.** esbuild here; RN needs the Babel-fidelity path (Reanimated,
  Expo Router) for the app delta and the reactnative-esm/native transform for vendor.
- **"Boot" = server-side.** 0.28 ms is assemble-and-serve from warm cache; device/browser
  eval of the image is separate and unchanged.
- **Cross-process sharing.** The 4.1 KB/env number assumes envs live in one resident
  process (shared heap buffer). For multi-process, the same sharing comes free by
  **mmap-ing the packed base image read-only** — the OS page cache dedupes physical pages
  across processes. Either path preserves the result; the sealed-closure trap does not.
