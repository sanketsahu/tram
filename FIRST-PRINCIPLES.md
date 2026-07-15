# Tram — First principles

The earlier framing ("which bundler, how to shrink Metro") was optimizing inside the
wrong box. This document restates the problem from scratch. The measurements are in
`bench/RESULTS.md`; the composition analysis below is from the scaffolded Expo app.

---

## 1. The number that reframes everything

For one Expo app:

| | value |
|---|---|
| `node_modules` on disk | **539 MB** |
| files in `node_modules` | **33,372** |
| packages installed | **365** |
| **packages actually reachable into the bundle** | **65** |
| **modules actually in the bundle** | **1,664** |
| **bundle size** | **~8 MB** |
| the code you actually edit (`src/`) | **80 KB, 19 files** |

The dev server crawls, indexes, watches, transforms, and holds **33,372 files / 539 MB**
in order to produce a graph of **1,664 modules from 65 packages / ~8 MB**, on behalf of
**19 files you actually touch**.

From first principles, ~8 MB of transformed code is the entire runtime input. The other
**~98.5% of `node_modules` never enters the bundle**: unreachable JS (117 MB of `.js`,
most unreferenced), TS sources shipped alongside their compiled JS (40 MB), sourcemaps
(52 MB), native iOS/Android/C++ code (36 MB), docs + metadata (17 MB), and ~300 packages
that are never referenced at all.

We are paying to store (×N copies), watch, index, and re-hold an **installation format**
when the only thing dev needs is a **distilled runtime artifact**.

---

## 2. The asymmetry every tool ignores

A dev bundle is two halves with opposite properties. Metro (and largely Vite/Next too)
treat them identically: one watcher, one module graph, one cache, one heap, rebuilt and
re-held **per process, per branch, per machine**.

| property | **Vendor** (`node_modules`) | **App** (`src/`) |
|---|---|---|
| disk | 539 MB | 80 KB |
| files to watch/index | 33,372 | 19 |
| reachable | 65 pkgs / 1,664 mods | all of it |
| changes during a dev session | **never** | **constantly** |
| identical across branches/copies | **yes** | no |
| needs HMR | ~never | always |

Every cost we measured is a direct consequence of collapsing these two halves into one:
the 2 GB cold spike, the 700 MB steady floor, the perfectly linear ×N scaling with zero
sharing, the 33k-file watch. None of it is intrinsic to the app. It is intrinsic to
treating immutable, shared, ~8 MB of vendor code as if it were mutable, private, and
539 MB, N times over.

---

## 3. The reframes (each is "beyond bundler")

**R1. `node_modules` is an install format, not a runtime input.**
Distill it once into a compact, content-addressed, memory-mappable **vendor image**: the
transformed graph of the ~65 reachable packages. After that, never touch the 539 MB at
dev time again. The install format is for installing; the vendor image is for running.

**R2. Dependencies are immutable during a session, so stop treating them as source.**
Do not watch them, re-crawl them, re-index them into a haste map, re-transform them, or
re-hold them in each heap. Watch `src/` only: **19 files, not 33,372.** The file-watcher
cost that started this whole investigation largely evaporates, because the watch surface
shrinks by ~1,700×.

**R3. For a fleet of copies, the vendor layer is a shared singleton.**
Same lockfile hash → byte-identical vendor image. Build it **once, globally**; every
branch/preview/session attaches to the **same memory-mapped image, read-only**. The OS
page cache holds one copy for all of them. Per-session marginal RAM becomes
`app-delta + runtime baseline`, not 0.7-2 GB. This is what collapses all three linear
cost lines at once, because the dominant mass stops being per-N.

**R4. The vendor half rarely needs HMR; the app half always does.**
So the device loads the static vendor image **once** (prebuilt, even pre-Hermes-compiled
and mmap'd), and only app modules stream over HMR. There is no giant serialized bundle to
assemble per session, which is what removes the 2 GB cold spike **at the root** rather
than caching around it.

**R5. The bundler is now an implementation detail.**
Metro vs Vite vs Rolldown/Oxc only decides *how the tiny app delta is transformed and
stitched to the vendor image*. That is a small surface (19 files). The architecture, an
**immutable shared vendor image + a thin mutable app layer + a device-side module
loader**, is the actual lever, and it is bundler-agnostic. This also dissolves the
Reanimated/Expo-Router parity worry: Babel only ever runs on `src/`, which is small, so
we keep full Babel fidelity where it matters at negligible cost, and the vendor image is
transformed once by whatever is fastest.

---

## 4. What "Tram" actually is

Not "a faster bundler." A **dev runtime built around the immutable/mutable split**:

1. **Vendor image builder** (global, content-addressed): `lockfile-hash → distilled,
   transformed, memory-mappable graph` of the reachable packages. Runs once per unique
   dependency set across the whole fleet. Cache key is the lockfile hash, so it
   invalidates only on `install`, which is rare.

2. **Thin per-session app server**: watches only `src/` (dozens of files), transforms
   only app modules (full Babel for Reanimated/Expo Router), serves HMR. Holds the app
   delta and a resolution table; references the vendor image by pointer, does not copy
   it into its heap.

3. **Device runtime loader**: loads the static vendor image once, then resolves app
   modules on demand / via HMR. No monolithic per-session bundle build.

### Thesis targets (to validate, not yet proven)

| dimension | today (per server, ×N) | Tram thesis |
|---|---|---|
| disk | 539 MB × N | one shared vendor image + per-branch `src/` (~50-100× less) |
| files watched | 33,372 × N | ~dozens × N (~1,000× less watch surface) |
| RAM per extra session | 0.7-2.0 GB | app delta + baseline; vendor mass shared/mmap'd |
| cold-bundle spike | ~2 GB transient | eliminated (no per-session full build) |

---

## 5. First-principles questions to pressure-test before building

1. **Native modules.** RN native code (the 36 MB of iOS/Android/C++) compiles into the
   dev-client **app binary**, which is already built once per SDK, not per session. The
   JS side that references native modules is what we bundle. So vendor-image distillation
   is orthogonal to the native build. Confirm this holds for our dev-client flow.
2. **Hermes.** Can the vendor image be precompiled to Hermes bytecode once and mmap'd on
   device, cutting device-side parse too? Likely yes; verify.
3. **Resolution correctness.** RN's platform extensions (`.ios`, `.native`, `.web`) and
   conditions must resolve identically in the distilled image. The distiller must bake
   per-platform vendor images (one per target), which is fine since platforms are known.
4. **Invalidation granularity.** Vendor image keyed by lockfile hash. A single changed
   dep rebuilds one image, shared again by all. App layer invalidates per file. Confirm
   no hidden coupling forces vendor rebuilds on app edits.
5. **The 65/365 reachable set.** Is it stable enough to distill ahead of time, or does
   dynamic `require`/conditional import pull in more at runtime? Measure the closure and
   decide whether the image is the reachable set or the full install (still shared).
6. **Where does bundling still have to happen at all on native?** Device JS engines do
   not do browser-style HTTP ESM. So "on-demand" needs a runtime `require` shim (the
   vxrn/One approach). Vendor-as-one-chunk + app-modules-on-demand is the split that
   fits that constraint.

---

## 6. Next step

This reframes §6 of `GOAL.md`. The first prototype is no longer "shared warm cache." It
is: **build a per-platform vendor image from the reachable set, serve it once, and watch
only `src/`** — then measure the four thesis numbers above against the baselines in
`bench/RESULTS.md`. If they hold even approximately, the bundler question answers itself.
