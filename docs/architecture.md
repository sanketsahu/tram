# Architecture

A dev runtime built around one observation: a dev bundle is two layers with opposite
properties, and Metro treats them the same.

| | **Vendor** (`node_modules`) | **App** (`src/`) |
|---|---|---|
| disk | 539 MB | ~80 KB |
| files | ~33,000 | ~19 |
| reachable into bundle | 65 pkgs / 1,664 mods | all of it |
| changes during a session | never | constantly |
| identical across branches/projects | yes | no |
| needs HMR | ~never | always |

Only ~8 MB of the 539 MB is reachable — **~98.5% of node_modules never ships**. tram
exploits the asymmetry: build/cache the vendor layer once and share it; keep only the tiny
app layer live.

## The pieces

```
                    ┌─────────────────────────────────────────────┐
  edit src/  ─────► │ shared transform service (Node, babel once)  │
                    │   content-addressed by source bytes          │
                    │   → ~/.tram/tstore   (cross-project cache)    │
                    └───────────────┬─────────────────────────────┘
                                    │ transformed modules (root-normalized)
                    ┌───────────────▼─────────────────────────────┐
   build (once) ──► │ bundle build  (Metro + tram transformerPath) │
                    │   → ~/.tram/images/<lockHash>  (mmap-able)    │
                    └───────────────┬─────────────────────────────┘
                                    │ pre-built, device-bootable bundle
                    ┌───────────────▼─────────────────────────────┐
   Expo Go ◄──────► │ thin dev server (Bun, ~40 MB, NO Metro)      │
     (device)       │   mmap bundle · /hot WebSocket · HMR         │
                    └─────────────────────────────────────────────┘
```

### 1. Cross-project cache (the core)

Transforms are content-addressed **by source bytes**, so the key is root-independent and
the same vendor module transforms **once** and is reused across *different* projects. The
stored output is normalized (project root → placeholder) and rehydrated to the caller's
root on read, so even worklet files that bake absolute paths become shareable.

Metro's own transform cache **can't** do this — its keys embed the project root, so a
second project doubles the cache instead of reusing it (measured). tram injects at Metro's
transformer seam via a custom `transformerPath`
([`src/tram-transformer.cjs`](../src/tram-transformer.cjs)) that wraps
`metro-transform-worker`.

### 2. Shared transform service

babel's ~150 MB resident footprint — not the vendor — is the real per-project memory hog.
One long-lived service ([`src/transform-service.mjs`](../src/transform-service.mjs)) pays
it **once** and serves N thin servers, keeping per-project memory flat.

### 3. Thin, no-Metro dev server

[`src/tram-serve-thin.ts`](../src/tram-serve-thin.ts) `mmap`s the pre-built bundle (shared
physical pages across processes) and serves Expo's dev protocol — status, the
`multipart/mixed` manifest (fresh id per load), the bundle, assets. No per-project Metro →
~40 MB. The heavy build happens once, at container-build / pre-warm time.

### 4. HMR, reconstructed from the bundle

The bundle carries `__d(factory, id, [deps], "path")` for every module, so path→id,
id→deps and inverse-deps are recovered by parsing it
([`src/tram-hmr.mjs`](../src/tram-hmr.mjs)). The `/hot` WebSocket speaks Metro's protocol;
on an edit the file is transformed (hot / React Refresh), wrapped with the right id +
dependencyMap + inverse-deps, and any new helper modules the transform pulls in are sent
as `added`. Validated on device.

## Invalidation

- **edit a file** → its content hash changes → 1 re-transform.
- **reach a new module** → resolve + 1 transform (or a store hit); no rebuild.
- **install** → new lockfile hash → new manifest; only changed modules re-transform.

Every bust is O(changed), never O(graph). Full model:
[../CACHE-MODEL.md](../CACHE-MODEL.md).

## Deeper

- Why the split: [../FIRST-PRINCIPLES.md](../FIRST-PRINCIPLES.md)
- Distribution (local → org → global CDN), reproducibility & trust: [../SHARED-CACHE.md](../SHARED-CACHE.md)
- The converged product shape: [../ARCHITECTURE.md](../ARCHITECTURE.md)
