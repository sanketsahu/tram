# Serializer + require runtime (executable bundles)

Until now the "bundle" was concatenated babel output with no module system — nothing
could run. `src/serializer.mjs` adds the missing piece:

- resolve the module graph from an entry (relative specifiers + extensions/index)
- transform each module to CommonJS
- assign numeric ids, build per-module dependency maps
- wrap each in `__d(factory, id, depMap)` + a Metro-style `__d`/`__r` runtime
- append `__r(entryId)`

## Verified by EXECUTION

Self-test bundles a real 4-module TS graph (index -> greet -> util/excl, + const) and
runs the output:

```
serialized 4 modules, 1459 bytes -> bundle.js
executed bundle -> __OUT = "Hello Jetplane!"
PASS: module graph resolved + executed correctly
```

The require graph resolves and executes correctly — the serializer + runtime are sound.

## What this unlocks / what remains

- **Unlocked:** a correct module system. Bundles produced this way actually run.
- **Next — integrate with the cache:** pre-serialize vendor modules into the vendor image
  with STABLE ids (content-addressed / fixed vendor id-space) so app-module dependency
  maps can reference vendor ids consistently across projects. This is the app/vendor
  boundary and the key design point.
- **Full resolver:** node_modules + package.json exports + platform extensions
  (`.ios/.native/.web`) for the real RN graph (current resolver handles relative only;
  bare imports are left to the vendor image).
- **RN runtime:** metro-runtime polyfills, InitializeCore, native module registry — and
  DEVICE/simulator validation (not available in this environment).

The self-test proves the serializer/runtime independently of RN; wiring the full RN graph
+ runtime + device is the remaining path to on-device execution.

## Stable content-addressed IDs + app/vendor boundary (src/full-bundle.mjs)

Module id = content hash of the normalized transformed code. This makes vendor module
ids IDENTICAL across projects, so the pre-built vendor image is shareable and app modules
reference vendor modules by the same stable id.

Test: an app (`app/index.ts` -> `./banner` + bare `import 'mylib'`) plus a node_modules
package (`mylib` -> `./shout`), built from two different roots and executed:

```
graph A: 4 modules (2 vendor)
vendor ids A: ["78ec1346bb5b","b817a5b406a2"]
vendor ids B: ["78ec1346bb5b","b817a5b406a2"]   <- identical across roots
vendor image byte-identical across roots: true
executed app+vendor bundle -> __OUT = "[TRAM!!!]"
PASS: cross-boundary execution + stable shareable vendor image
```

Proven: (1) content-hash ids are stable/root-independent -> shareable vendor image;
(2) bare-import (vendor) resolution + app->vendor require across the boundary; (3) the
assembled app+vendor bundle executes correctly.

Remaining for on-device: full RN resolver (platform exts, package exports, the real
react-native/expo-router graph), the RN runtime (metro-runtime, InitializeCore, native
module registry, Hermes), device/simulator validation, and wiring this serializer into
the thin server + vendor-image builder (replacing naive concatenation).
