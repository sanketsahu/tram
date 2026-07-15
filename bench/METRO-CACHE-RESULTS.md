# Metro cross-project vendor cache — results

Real `babel-preset-expo` transforms on a worst-case vendor sample (995 files:
reanimated + worklets + expo-router source, incl. the path-baking worklet files).
Content-addressed by SOURCE bytes (root-independent); stored output PATH-NORMALIZED;
local root rehydrated on serve. Script: `bench/metro-cache-bench.mjs`.

| metric | result |
|---|---|
| vendor sample | 995 real files |
| store | 972 entries, 3 MB, image 3,210 KB |
| cold (transform all) | 5,844 ms, peak RSS **303 MB** |
| warm (all hits, assemble) | 25 ms, 995/995 hits |
| packed boot (1 image read) | **0.38 ms** |
| cross-project (project B, key=source) | **995 HITS / 0 miss** |
| byte-consistent after normalize | **993 / 995 (99.8%)** |

## Memory, correctly separated (was conflated before)

The earlier "303 MB peak" was the ONE-TIME GLOBAL cold transform, and the "packed 322 MB"
was bogus — measured in the same long-lived process that had already grown to 303 MB.
Measured cleanly in fresh processes (`bench/metro-boot-mem.mjs`):

| phase | memory | frequency |
|---|---|---|
| cold transform (babel, 995 files) | 303 MB peak | ONCE, globally (amortized over all projects; reducible via oxc for non-worklet files) |
| **warm boot per project** (fresh proc: 37.8 → 51.1 MB) | **+13.3 MB** | per project; ~0 shared if the image is mmap'd |
| bare node baseline | 35.6 MB | — |

- vs Metro cold-bundle spike **~2,018 MB**: our per-module transform is bounded and never
  assembles a monolithic bundle, so the 2 GB transient cannot occur.

### Caveat for integration path 1 (Metro cache-store)

Path 1 keeps **Metro running per project** (~325 MB idle baseline). Our cache removes the
2 GB cold SPIKE and enables cross-project reuse, but does NOT remove Metro's baseline. So
path 1 delivers: 2 GB spike -> ~325 MB steady per project. Removing the baseline too
(down toward the ~13-50 MB range) requires path 2 (shared vendor service + thin app
layer, no per-project Metro).
- **Boot: 0.38 ms packed vs ~3,130 ms Metro cold bundle.**
- **Disk: 3 MB shared store (all same-dep projects) vs 539 MB node_modules per project.**

## Cross-project sharing: PROVEN

A different project root gets 100% cache hits (keyed by source bytes), 99.8% byte-identical
after normalizing the baked root prefix. This is the clarified goal: many different
projects reuse one vendor cache.

## Known gap (0.2%)

2 of 995 files still differ after root-prefix normalization. Likely worklet files that
embed a SECOND path-derived value (e.g. a hash of the absolute path, not just the raw
string). Next step: identify those 2, find the extra impurity, and normalize it (or
transform worklet files with a canonical filename so nothing path-derived leaks). Until
then those specific modules would be recomputed per project (correct, just not shared).
