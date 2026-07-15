# Path 2 (thin per-project server) — findings

Thin Bun server (`src/serve-expo.ts`): mmaps the pre-built vendor image, live-transforms
the app layer, serves an assembled bundle. Measured against `bench/expo-app`.

## Measured

| metric | value | vs Metro |
|---|---|---|
| boot to ready | ~150 ms | vs ~1,100 ms `expo start` |
| **idle RSS (vendor mmap'd, no babel)** | **54.9 MB** | vs ~325 MB Metro idle |
| RSS after babel loads for app transform | **257 MB** | — |
| vendor image (mmap, shared) | 3.1 MB | — |

## The key finding: babel is the per-project memory hog, not vendor

- mmap'ing the pre-built vendor image gets a thin server to **55 MB idle** — the vendor
  memory problem is solved.
- But loading `@babel/core` + `babel-preset-expo` in-process to transform the app layer
  adds **~200 MB** (55 -> 257 MB) — before it even finishes. babel's resident footprint,
  not the module count, is the cost. The app layer is tiny (19 files); the transformer is
  heavy.

## Consequence for the architecture

To keep per-project memory near 55 MB, the app-layer transform must NOT run babel
in-process per project. Options:

1. **Shared transform service (recommended).** One babel process (~200 MB) serves ALL
   thin per-project servers over IPC/HTTP. Babel's cost is paid ONCE and amortized; each
   per-project server stays ~55 MB (vendor mmap + a thin transform client). Fits the
   "shared node processes + global cache" deployment directly.
2. **Lighter transformer for the app layer.** Use oxc/swc (Rust, ~MBs resident) for app
   files, reserving babel only for the files that need its plugins (worklets, expo-router
   typed routes) — ideally those via the shared service too.

## Incidental bug (not the point)

Transforming the app layer errored under Bun: `ENOENT resolving '@babel/generator' from
react-native-worklets/plugin`. A Bun module-resolution quirk for the worklets plugin;
solvable (resolve plugins from the project, or run babel under node). It did not affect
the memory finding — babel had already loaded (RSS 257 MB) before failing.

## Shared transform service — measured (bench/path2-amortized.mjs)

One Node babel service + N thin Bun servers (mmap vendor, transforms delegated):

| | RSS |
|---|---|
| shared transform service (babel, ONCE) | 63 MB startup -> 148 MB after transforms |
| thin server idle | 29 MB |
| **thin server after serving a bundle** | **54 MB** (babel NOT in-process; no 257 MB jump) |
| 3 thin servers total | 54 + 55 + 54 = 163 MB |
| app-transform cache | transforms 17 -> 17 on 2nd serve (100% hit) |

- Serving a bundle keeps the thin server at **54 MB** (vs 257 MB when babel was
  in-process). babel's ~148 MB is paid ONCE in the shared service.
- Second serve hit the cache (transforms flat, 17 hits) — zero babel work.

### Fleet cost model

**~54 MB x N  +  ~148 MB once**, vs Metro **~325 MB x N idle / ~2018 MB x N cold spike**.
For 24 envs: ~1.4 GB (tram) vs ~7.8 GB idle / up to ~48 GB spiking (Metro).

Bonus: all thin servers `mmap` the SAME vendor image read-only, so vendor pages are
physically shared via the OS page cache — real aggregate memory is BELOW the 163 MB sum
(ps RSS overcounts shared pages).

## End-to-end `tram dev` (Expo) — measured

`bun src/cli.ts dev bench/expo-app` — detect expo -> ensure shared service (singleton) ->
build/reuse content-addressed vendor image -> start thin server.

| run | boot | thin server RSS | shared service RSS | note |
|---|---:|---:|---:|---|
| **cold** (builds vendor image, 995 mods) | 6,402 ms | 60 MB ready | 735 MB | one-time build; at container-build/pre-warm time in prod |
| **warm** (image reused) | **168 ms** | **40 MB** ready / 68 serving | 63 MB | the common case |

- Warm boot **168 ms** vs Metro `expo start` ~1,100 ms.
- Thin server **40 MB** idle vs Metro **325 MB**; no 2 GB spike ever.
- Bundle assembles in **7.9 ms** warm (app transforms cached in the service).
- The 735 MB service is the vendor-image BUILD high-water (babel churning 995 modules),
  paid once per lockHash — and in the pre-built-cache deployment it happens at
  container-build / pre-warm time, never at dev-env boot.

## Remaining (honest)

- Device execution not validated here (no simulator); exact Metro module-id/serializer
  parity is future work. What's proven: memory, boot, cross-project cache, bundle
  assembly from cache + shared transform.
- cache-vary (env dimensions, PR expo/expo#47750) for the app layer: to add so env-inlined
  app modules stay correct across environments.
- 0.2% worklet normalization gap (2/995) still to close.
