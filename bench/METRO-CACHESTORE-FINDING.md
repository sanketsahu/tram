# Metro cacheStore: cross-run yes, cross-project NO

Attempt: point Metro's own `FileStore` at a global dir (`~/.jetplane/metro-cache`) via
`config.cacheStores` in `expo-app/metro.config.js`, hoping for cross-project sharing in
Expo's guaranteed-bootable pipeline.

## Measured

- **expo-app cold bundle**: HTTP 200, 8.26 MB, **1,664 `__d` modules + `InitializeCore`**
  = a valid, device-bootable Metro bundle. Global cache populated: 29 MB / 1,670 entries.
- **Second project (same deps, different root) bundle**: cache grew **+1,262 entries**
  (29 -> 50 MB). It did **not** reuse expo-app's cache.

## Conclusion

- **Metro's transform cache keys are root-dependent** (embed absolute paths), so a
  different project root -> different keys -> no cross-project hit.
- **The `cacheStore` layer cannot fix this**: it receives only an opaque `(key, value)`;
  it never sees the source, so it cannot re-key by root-independent content.
- Therefore a global `FileStore` gives only **cross-RUN** (same-project restart) warm
  caching — which still kills the cold spike on restart, a real but lesser win — and NOT
  the **cross-project** sharing that is the goal.

## Implication (points back to the transform-level approach)

Cross-project sharing requires keying by root-independent **source content**, which can
only be done at the **transform layer**. That is exactly the Jetplane transform service
(`src/transform-service.mjs`), which already measured **100% cross-project hits** on 995
vendor modules (`bench/METRO-CACHE-RESULTS.md`). Metro's native caching does not and
cannot provide it.

So: to get BOTH device-bootable AND cross-project, the transform-level content-addressed
pipeline (path 2) must be completed to device-bootable — i.e. finish the serializer +
RN runtime. The Metro `FileStore` shortcut is scannable today but only warms restarts.

## SOLVED: custom transformer worker (cross-project INSIDE Metro's pipeline)

Instead of the cache-store layer (can't re-key) or a from-scratch serializer (risky),
the seam is Metro's `config.transformerPath` — a custom worker that wraps
`metro-transform-worker` and caches by a ROOT-INDEPENDENT key (project-relative path +
option signature + source bytes), storing the result path-normalized and rehydrating the
caller's root on read. Files: `src/jetplane-transformer.cjs` + `expo-app/metro.config.js`.

Validated in isolation (`bench/jetplane-worker-test.mjs`, no 2 GB bundle):
- cold transform -> **valid Metro module** (`__d(` + `_dependencyMap`, 8 deps), stored
- warm (same root) -> cache HIT, store didn't grow, byte-identical
- **different project root -> REUSED (store didn't grow), rehydrated to root B,
  structurally identical to A modulo the root**

This gives cross-project transform caching in Expo's real, device-bootable Metro
pipeline. `metro-transform-worker` confirmed to emit correct Metro-format output
(dependency-map index rewriting), so the transform-format unknown is closed too.

Remaining: a full `expo start` bundle through this worker timed out in this environment
(2 GB cold spike + per-module JSON I/O > 2 min foreground) — needs a longer run / the
user's machine. Then scan on device to confirm boot + cross-project warmth.

(The second project's 500 was incidental: the quick copy omitted `@/assets`, so an image
import failed to resolve — not related to caching.)
