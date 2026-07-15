# Tram — Invalidation & the layered cache model

Answers the two questions that make or break the vendor-image idea:
1. What happens when we install new packages?
2. What happens when the app newly imports a vendor file that wasn't reached before
   (previously "tree-shaken" / a deep file import)?

The short version: the vendor image is a **lazily-populated, content-addressed cache
plus a live resolver**, not a sealed closure. Key it on the **lockfile hash** (immutable,
shareable), never on the app's reachable set (mutable, per-branch).

---

## 0. Correction to "never touch the 539 MB"

To resolve a cache miss (Q2), the source bytes must still exist. So we keep
`node_modules` **once per box, shared read-only** (pnpm/bun content-addressed store,
hardlinked), not N copies. "Distill" means: do not **watch** it, do not **eagerly
index / transform / hold** it per process. It sits cold and is paged in on demand.

---

## 1. Two hashmaps

**H1 — Global transform store (master, shared across the whole fleet):**

```
key:   hash(sourceBytes + transformOptions)     // transformOptions = platform, engine, dev, babel plugins, ...
value: transformedModule (+ its own resolved dep edges)
```

Immutable, append-only, content-addressed. `react-native/index.js` transformed for iOS
is stored **once, forever**, reused by every app / branch / lockfile referencing those
exact bytes. This is where the cross-fleet sharing actually happens.

**H2 — Per-lockfile manifest (coarse, one per unique dependency set):**

```
key:   lockfileHash
value: { moduleResolvedPath -> sourceContentHash, ...resolution hints }
```

Lets a session map an import to a store entry without re-crawling `node_modules`.
Adjacent lockfiles (before/after an install) share ~all entries.

**Per-session app layer (mutable, small):** watch `src/` only; transform app modules on
change; hold an overlay of which vendor increments this session has already shipped to
its device.

---

## 2. Q1 — install new packages

1. `bun/pnpm install` runs → new `node_modules` bytes (shared store, hardlinked) and a
   new **lockfileHash**.
2. New lockfileHash → new **H2 manifest**. It shares almost every
   `path -> contentHash` entry with the previous manifest; only added/changed/removed
   packages differ.
3. Nothing is eagerly rebuilt. When the app imports a changed/new module, we transform
   it **lazily** and write it to **H1** (keyed by its new content hash). Unchanged
   modules keep their old content hash → their transforms are reused from H1 for free.
4. Cost ∝ number of changed modules **actually imported**, not total installed. A hot
   dep bump (`react-native`) touches many modules, but each is transformed once,
   per-module, shared forward, and streamed — **never a monolithic 2 GB rebuild.**

Delivery to a running device: changed modules ship as **increments** (see §4).

---

## 3. Q2 — newly import a vendor file not reached before

Includes: an import DCE'd out earlier, or a deep import like `pkg/foo/bar`, or an asset
`require`.

1. Bytes on disk did **not** change. **lockfileHash unchanged. H2 manifest unchanged.
   Base image unchanged.** Only the app's reachable set grew.
2. Resolve the specifier against the shared on-disk `node_modules` (the resolver falls
   back to real resolution on a miss — it is not limited to the precomputed closure).
3. Look it up in **H1** by content hash:
   - **Hit** (another branch/session already imported it): free.
   - **Miss**: transform that **one module** once, write to H1, serve.
4. The image is not rebuilt. It **gains one entry, shared forward to everyone.** Ship the
   module to the device as an increment.

**Design invariant:** the vendor image is a cache + resolver, never a sealed closure. If
it were sealed to the reachable closure, Q2 would force a rebuild. It is not sealed.

---

## 4. Base + increments (the layering, and how the device sees it)

- **Base image**: the transformed modules for the reachable closure at session start.
  The device loads this once (static, mmap-able, optionally pre-Hermes-compiled).
- **Increments**: modules added later — from Q2 (new reach) or Q1 (install) — transformed
  lazily and pushed over the **same HMR channel** as new/redefined module definitions
  (`__d(id, factory)`), exactly like a hot update. The device runtime loader already
  accepts new and redefined modules.
- **Upgrade override**: an install that changes a module already in the base emits an
  increment with a **new content hash** that **redefines** that module id on device.
  Same mechanism as HMR; no rebuild.

So "base + increments" is literally: base chunk + a stream of content-addressed module
definitions, each transformed at most once per (content, transformOptions) across the
entire fleet.

```
          H1 (global transform store, content-addressed, fleet-shared)
                        ^                       ^
                        | miss -> transform once|
   ┌────────────────────┴───────┐   ┌───────────┴───────────────┐
   │ session A (branch X)        │   │ session B (branch Y)       │
   │  base = closure@start       │   │  base = closure@start      │
   │  + increments (Q1/Q2)  ─────┼───┼──► shared hits             │
   │  app layer: watch src/ only │   │  app layer: watch src/only │
   └─────────────────────────────┘   └────────────────────────────┘
        H2 manifest(lockfileHash)          H2 manifest(lockfileHash')
```

---

## 5. Why this preserves every property we wanted

- **Sharing survives mutation.** Content addressing means a change touches only changed
  entries; everything else stays a shared hit. Install and new-import are both deltas.
- **No spike.** Work is per-module and streamed; memory is bounded by the largest single
  module, not the whole graph.
- **No re-crawl / re-watch.** `node_modules` is immutable during a session; only `src/`
  is watched. An install is an explicit event that swaps the H2 manifest, not a watch
  storm.
- **Correctness on misses.** The live resolver can always fall back to on-disk
  `node_modules`, so nothing depends on having guessed the closure correctly up front.

---

## 6. Things to verify

- **Transform-edge capture.** H1 must store each module's resolved dep edges so the
  device loader knows what to request next without re-resolving. Confirm edges are stable
  under content addressing (they are, if resolution is deterministic per lockfile).
- **Resolution determinism.** Same lockfile + same specifier + same platform must always
  resolve to the same path, or H2 hints go stale. RN platform extensions
  (`.ios/.native/.web`) mean H1 keys must include platform in transformOptions (already
  planned).
- **Store growth / GC.** H1 is append-only and fleet-wide; needs an LRU/refcount GC keyed
  by lockfile liveness so it does not grow unbounded.
- **App-layer reuse.** App modules change constantly; content-addressing them gives low
  hit rates but is harmless. Keep them in a per-session cache, not H1.
- **Install atomicity.** The manifest swap on install must be atomic per session so a
  half-written `node_modules` never serves a mixed graph.
