# Getting started

Research WIP — there is no published npm package yet. The tooling lives in
[`../src/`](../src/) and runs with [Bun](https://bun.sh) (Node works for the transform
service). These steps reproduce the measured results and the on-device HMR demo.

## Prerequisites

- Bun ≥ 1.2, Node ≥ 20
- Xcode Simulator and/or **Expo Go** on a phone (for the on-device demo)
- macOS (the benchmarks were run on Apple Silicon / macOS 15)

## 1. Cross-project cache in a real Expo app

`bench/expo-app-54` is an Expo SDK 54 app (expo-router + Reanimated) with the tram
transformer wired into `metro.config.js`.

```bash
cd bench/expo-app-54
npx expo start          # first run builds the shared cache in ~/.tram/tstore
```

Bundle a **different** project with the same deps — it reuses the cache cross-project:

```bash
cd ../bench/expo-app-54-b
npx expo start --port 8082
node ../../src/tram-stats.mjs   # hit-rate for the last bundle (reset with: … reset)
```

## 2. Thin, no-Metro dev server + HMR

Capture a bundle once (fast — warm cache), then serve it from the thin server:

```bash
# capture the device-bootable bundle + manifest (build phase, once)
#   done automatically by the flow in bench/MEMORY-FUSION.md → ~/.tram/images/expo54/

# serve it — no Metro, ~40–68 MB, prints a QR
bun src/tram-serve-thin.ts bench/expo-app-54 8091
```

Scan the QR in Expo Go (or `exp://localhost:8091` on the simulator). Then edit
`bench/expo-app-54/app/(tabs)/index.tsx` and save — the screen hot-reloads via React
Refresh, served entirely from the thin process.

## 3. Run the benchmarks

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

## Caveat

Some configs (`metro.config.js`, `tram-serve-thin.ts`) contain absolute paths specific to
the author's machine. Parameterize them before running elsewhere.
