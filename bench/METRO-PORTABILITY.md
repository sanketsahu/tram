# Metro/Expo vendor transform portability (GATE: PASS)

Question: are Metro/Expo vendor transforms content-addressable across two different
project roots (the requirement for cross-project caching)? Method: transform the same
vendor source with `babel-preset-expo` (caller: metro, platform ios) under two real
checkout roots and diff. Script: `bench/metro-portability.mjs`.

## Result

| vendor file | identical across roots | identical after normalize | abs-path hits |
|---|---|---|---|
| `react-native/Libraries/Components/View/View.js` | yes | yes | 0 |
| `expo-router/build/Route.js` | yes | yes | 0 |
| `react-native-reanimated/src/animation/clamp.ts` | no | **yes** | 4 |

## Reading

- **Most vendor is byte-identical across roots out of the box** → directly
  content-addressable, shareable cross-project with no work.
- **Worklet-style files (Reanimated) bake the absolute filename** (its Babel plugin reads
  the file from disk at `filename`). But the ONLY difference is the root prefix, and after
  normalizing it to a placeholder the outputs are **byte-identical**. So these are
  content-addressable too, after a path-normalization pass.
- **No structural divergence anywhere.** The gate is passed.

## Consequences for the Metro adapter

1. Hash vendor transforms by `normalize(sourceBytes+output)` where `normalize` maps the
   project/checkout root to a canonical placeholder. Better: transform worklet files with
   a canonical filename so the baked path is root-independent from the start.
2. After path-normalization, the remaining transform impurity is ambient values (env),
   which is an **app-layer** concern handled by cache-vary (PR expo/expo#47750). Vendor
   is hermetic → safe to share across projects and (later) across the org/global CDN.
3. This validates the whole cross-project premise for Metro, which is where the payoff is
   largest (the ~2 GB cold-bundle spike + large vendor).

## Next

Build the Metro cross-project vendor cache slice: distill + pack the reachable vendor set
(path-normalized, content-addressed), then measure two DIFFERENT Expo projects with
shared deps hitting one warm vendor image — boot, memory, and whether the 2 GB cold spike
is avoided. Integrate via the existing `reactnative-esm` vendor server where possible.
