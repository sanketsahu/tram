# Getting started

## Install (the Metro plugin) — in your Expo project

Requires Expo SDK 54+ and Node 20+.

```bash
npm install jetplane
npx jetplane init       # wires the transform cache into metro.config.js
npx expo start          # your normal flow — now cross-project cached
```

`jetplane init` writes (or tells you to add) two lines:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.transformerPath = require.resolve('jetplane/transformer') // the Metro plugin
config.cacheStores = []                                          // jetplane owns caching

module.exports = config
```

The first bundle populates a shared, content-addressed cache under `~/.jetplane`. Every
other same-dep project (and every restart) reuses it, so cold bundles stop re-transforming
`node_modules`. That is the whole integration — you keep the entire Expo CLI and `expo start`.

## Reproduce the benchmarks from this repo

`bench/expo-app-54*` are Expo SDK 54 apps (expo-router + Reanimated) with the plugin wired
in. Prerequisites: Node ≥ 20, Bun ≥ 1.2 (for the thin server), and Expo Go / a simulator.

```bash
cd bench/expo-app-54
npx expo start          # first run builds the shared cache in ~/.jetplane/tstore
```

Bundle a **different** project with the same deps — it reuses the cache cross-project:

```bash
cd ../bench/expo-app-54-b
npx expo start --port 8082
node ../../src/jetplane-stats.mjs   # hit-rate for the last bundle (reset with: … reset)
```

## Thin, no-Metro dev server + HMR (experimental)

Capture a bundle once (fast — warm cache), then serve it from the thin server:

```bash
# capture the device-bootable bundle + manifest (build phase, once)
#   done automatically by the flow in bench/MEMORY-FUSION.md → ~/.jetplane/images/expo54/

# serve it — no Metro, ~40–68 MB, prints a QR
bun src/jetplane-serve-thin.ts bench/expo-app-54 8091
```

Scan the QR in Expo Go (or `exp://localhost:8091` on the simulator). Then edit
`bench/expo-app-54/app/(tabs)/index.tsx` and save — the screen hot-reloads via React
Refresh, served entirely from the thin process.

## Run the benchmarks

```bash
# Metro vs Vite vs Next memory + Metro's cold-bundle spike
node bench/measure.mjs expo-native

# cross-project vendor cache (995 real modules): cold/warm/packed + reuse
node bench/metro-cache-bench.mjs

# thin-server + shared transform service memory
node bench/path2-amortized.mjs
```

Results and methodology: [benchmark.md](./benchmark.md) and the raw docs in
[`../bench/`](../bench/).

## The website

```bash
cd website
npm install
npm run dev     # http://localhost:3000
```

Next.js + shadcn (radix-ui) + Tailwind. The interactive benchmark chart is
`components/benchmark-chart.tsx`.

## Notes

- The plugin (`jetplane/transformer`) is Node-only and ships in the published package. The
  thin dev server and HMR are experimental and run under [Bun](https://bun.sh).
- The shared cache lives under `~/.jetplane`; delete it to reset.
