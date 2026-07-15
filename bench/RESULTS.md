# Benchmark results — dev server memory

Machine: macOS 15.6.1, 14 cores, 48 GB RAM, Node v22.19.0. **No Watchman installed**
(Metro falls back to its own file crawler). Each server measured alone (no
contention). RSS = resident set size of the whole process group, sampled every
300-500ms. "Cold" = Metro caches (`$TMPDIR/metro-cache`, `metro-file-map-*`) cleared
first. Bundle URL is the exact one Expo hands the device.

## Memory (RSS of the dev-server process tree)

| Dev server | Target | Idle-ready | Peak while bundling | node_modules |
|---|---|---:|---:|---:|
| **Vite** (react-router) | web | 255 MB | **255 MB** (lazy ESM, no full bundle) | 88 MB |
| **Next.js 16** (Turbopack) | web | 851 MB | **853 MB** | 344 MB |
| **Expo / Metro** (Expo Router) | native iOS, warm cache | 324 MB | 404 MB | 539 MB |
| **Expo / Metro** (Expo Router) | native iOS, **cold** | 326 MB | **2018 MB** | 539 MB |
| **Expo / Metro** (Expo Router) | **web**, cold | 322 MB | **1915 MB** | 539 MB |

Bundle produced by Metro: ~8.3 MB, ~192k lines (native). Cold bundle time ~3s.

## The headline

**Metro's memory problem is the cold bundle spike, not idle.** Idle Metro is ~325 MB
(comparable to Vite, lighter than Next). But the moment it builds a bundle with a cold
cache it transiently spikes to **~2 GB**, on both native and web. Warm-cache rebuilds
stay ~400 MB.

This matches your fleet symptom exactly: you kill idle Metros, so idle cost is not what
bites you. What bites you is that **spinning a server up and serving its first bundle
costs ~2 GB transiently**, and if several environments cold-bundle at once (fresh env,
cache miss, branch switch) the box OOMs. Vite never does this because its dev server is
lazy on-demand ESM. It never builds one big bundle, so there is no spike to begin with.

## Caveats / fairness

- **Architectural apples-to-oranges is the point.** Vite (and Turbopack to a lesser
  degree) serve transformed modules on demand over native ESM; they never assemble a
  single monolithic bundle in dev. Metro always builds the full serialized bundle. The
  ~2 GB is the cost of that model with a cold Babel transform pass over the whole graph.
- Vite's 255 MB reflects the entry + a few app modules being transformed, which is what
  a browser actually pulls on first load. Crawling every route would add some, but Vite
  transforms are per-module and cheap; it will not approach Metro's spike.
- Next's 853 MB is a full route compile via Turbopack (Rust core + Node).
- Reproducibility: two independent cold Metro bundles (native 2018 MB, web 1915 MB) both
  landed at ~2 GB, so the spike is stable, not a fluke.
## Follow-up 1 — does Metro release the spike? (metro-decay.mjs)

After a cold native bundle, RSS sampled every 1s for 60s:

```
idle-ready: 365 MB
cold bundle done (3.0s): 2149 MB
t=0s  2134    t=15s 1356    t=21s 713 ... t=60s 713
final: 711 MB
```

**Metro does NOT return to idle.** The ~2.1 GB spike drains over ~20s and **settles at
~713 MB**, then holds there for as long as the server is alive. So there are two
distinct costs:

- **Transient spike:** ~2.0-2.1 GB for ~15-20s while bundling + GC.
- **Steady floor after bundling:** ~700 MB resident (idle was only ~365 MB). Metro keeps
  the module graph + transform state in the heap.

## Follow-up 2 — N concurrent cold bundles (metro-fleet.mjs)

N isolated Metro instances (each own cache, own port), all cold-bundling at once:

| N | Agg idle | Agg peak (concurrent bundle) | Per-instance peak | Agg settled |
|---:|---:|---:|---:|---:|
| 1 | 324 MB | 1986 MB | 1986 MB | — |
| 2 | 658 MB | 3642 MB | 1821 MB | 3604 MB |
| 4 | 1309 MB | 6977 MB | 1744 MB | 5950 MB |

**Perfectly linear. Zero sharing.** Idle scales at ~327 MB × N. Concurrent cold-bundle
peak scales at ~1.75-2.0 GB × N (per-instance dips slightly only because CPU contention
staggers the spikes; with enough cores they overlap closer to 2 GB each). Every instance
re-crawls and re-holds the *identical* `node_modules` with no dedup whatsoever.

Bundle time also degrades under contention: 3.2s (N=1) → 5.7s (N=2) → 11.0s (N=4), as
instances fight for CPU during their Babel passes.

### What this means for a fleet node

Three linear cost lines, all with slope-per-server and no sharing:

- **Idle:** ~0.33 GB × N
- **Alive post-bundle (steady):** ~0.7 GB × N
- **Concurrent cold bundle (transient):** ~1.9 GB × N

On a 32 GB node: ~45 alive servers hit the steady floor (31 GB), OR just **~16
simultaneous cold bundles OOM the box** (30 GB) regardless of how few servers exist
otherwise. A deploy / cache eviction / mass branch update that triggers a burst of cold
bundles is the OOM trigger. This is the curve that should drive the design.

## How to reproduce

```
node bench/measure.mjs vite
node bench/measure.mjs next
# cold Metro:
rm -rf $TMPDIR/metro-cache $TMPDIR/metro-file-map-*
node bench/measure.mjs expo-native
rm -rf $TMPDIR/metro-cache $TMPDIR/metro-file-map-*
node bench/measure.mjs expo-web
```
