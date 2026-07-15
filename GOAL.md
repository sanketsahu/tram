# Jetplane — Goal

> A low-footprint dev/bundling toolchain for Expo apps, purpose-built for running
> many app servers per machine in a cloud dev-environment fleet.

Status: **exploration**. This document is the north star. It defines the problem,
the constraints, and the success metrics. Design decisions and architecture live in
follow-up docs once we agree on direction.

---

## 1. The mission

We run **dozens of Expo dev servers per machine** to power cloud-hosted dev
environments (one env per developer / per branch / per preview). Today this is
dominated by two costs:

1. **RAM** — each Expo/Metro server holds its own Node heap, module graph,
   transform cache, and file-watch state. Multiply by dozens and a box is saturated.
2. **Disk** — each project carries its own `node_modules`, which for an Expo app is
   large and almost identical across projects.

**Primary goal: cut per-server RAM dramatically.**
**Secondary goal: cut disk via a shared, content-addressable module store.**

If we hit both, we fit far more dev environments per machine at the same spend,
which is the actual business win.

---

## 2. Hard requirements (non-negotiable)

Whatever we build or adopt must preserve the developer experience Expo gives today:

- **Both targets: native (iOS/Android) and web.**
- **Fast HMR / Fast Refresh** on both targets, including React component state
  preservation on native.
- **Full feature parity with Metro** for the flows our apps use:
  - Platform-specific extensions (`.ios.tsx`, `.android.tsx`, `.web.tsx`, `.native.tsx`).
  - Asset handling (images, fonts, `require` of assets, asset hashing/resolution).
  - `react-native` package resolution semantics + Node/browser conditions for web.
  - Symbolication of stack traces in dev.
  - Source maps.
  - Env/`babel`-level transforms our apps depend on (Reanimated worklets, Expo Router
    typed routes, etc.) — these are the sharp edges.
- **Expo compatibility**: works with the Expo CLI dev-client / Expo Go flow, or gives
  us a drop-in equivalent. We should not force app authors to rewrite their apps.

Anything that breaks Reanimated, Expo Router, or Fast Refresh is a non-starter.

---

## 3. Success metrics

We are not done until we can put numbers on it. Targets are hypotheses to validate,
not commitments yet.

| Dimension | Baseline (measure first) | Target |
|---|---|---|
| RAM per idle dev server | TBD (measure current Metro) | ≤ 25% of baseline |
| RAM for N=24 servers on one box | TBD | fits comfortably in a standard fleet node |
| Disk per project `node_modules` | TBD | ~single shared store + per-project deltas |
| Cold start (first bundle) | TBD | ≤ Metro, ideally faster |
| HMR latency (edit → screen) | TBD | ≤ Metro on both web + native |
| File-watch overhead at rest | TBD | shared across projects, near-flat with N |

**First action item before any building: instrument the current setup** and record
the baseline table above. We optimize against measured numbers, not intuition.

---

## 4. Where the cost actually comes from (hypotheses)

The user's instinct is file watchers + Metro bundling. Breaking that down:

### RAM
1. **One Node process per server.** Baseline Node heap + V8 overhead, times dozens.
   This is fixed cost we pay N times regardless of what the bundler does.
2. **File watching / haste map.** Metro's `metro-file-map` crawls the project and
   builds an in-memory map of every file (including `node_modules`). Even with
   Watchman offloading the OS-level watch, the in-process map is large, and it is
   **duplicated per server** even though `node_modules` is ~identical across projects.
3. **In-memory module graph + transform results.** Metro keeps the transformed module
   graph resident. Babel transforms are memory-hungry.
4. **No sharing between servers.** Two servers for two branches of the same app hold
   two nearly-identical graphs and two nearly-identical watch maps.

### Disk
1. **`node_modules` duplicated per project.** The single biggest disk item, and mostly
   identical bytes across projects.
2. Per-project Metro/transform caches.

### The leverage
The highest-leverage ideas fall out directly:
- **Deduplicate `node_modules`** (content-addressable global store, hardlinks/symlinks).
  This cuts disk *and* shrinks what any watcher must track *and* enables sharing
  transform results keyed by content hash.
- **Share file watching** across servers via one daemon that watches the shared store
  once, so cost stays near-flat as N grows instead of scaling linearly.
- **Move transform + bundle work out of the Node heap** (Rust) to cut the per-server
  resident set.
- Consider a **multi-tenant bundler**: one long-lived process serving many apps,
  sharing caches for identical dependency subgraphs, instead of one heavy process each.

---

## 5. Solution space (to evaluate, not yet chosen)

### Disk / module store
- **Bun** — global cache + hardlinks into `node_modules`. Fast installs, big disk dedup.
  Yes, this is the "common place" the user is thinking of.
- **pnpm** — global content-addressable store, symlinked `node_modules`. Strongest
  dedup story and a hard isolation model; well understood at scale.
- Decision axis: which one plays nicely with RN/Expo's resolution quirks and with our
  chosen watcher/bundler. pnpm's symlinked layout sometimes trips RN tooling; Bun's
  hardlinked flat-ish layout is usually friendlier to RN but Bun-as-runtime for the
  dev server is a separate question from Bun-as-installer.

### Bundler / dev server
- **Metro (keep, optimize).** Lowest risk. Wins available: force Watchman, shrink the
  watched set, share caches, tune `maxWorkers`, run headless. May not reach the RAM
  target because the per-process Node cost and per-process graph remain.
- **Re.Pack + Rspack (Callstack).** Rust-core (Rspack) bundler with real RN support
  and its own HMR. Mature-ish path to a faster, lighter native bundler.
- **Vite ecosystem / voidzero stack.** `vxrn` / **One** already do "Vite for React
  Native" (Vite dev server + a native runtime + HMR). Vite is moving onto **Rolldown**
  (Rust) with **Oxc** (Rust parser/transformer/resolver). This is the "voidzero
  tooling" path: modern, fast, Rust where it counts, plugin-friendly, web is native to
  Vite and native is the frontier.
- **Rewrite the bundler in Rust ourselves.** Maximum control over the memory model
  (shared graph, mmap'd caches, one multi-tenant process) but the most work and the
  most risk against Reanimated/Expo Router/Fast Refresh parity.

### The parity trap
The hard part of any non-Metro path is not bundling. It is the **Babel-level
transforms** RN apps rely on (Reanimated worklets, Expo Router, Expo's babel preset)
and the **native HMR protocol**. Oxc's transformer is fast but is not a drop-in for
every Babel plugin. Whatever we pick must have a credible story for these, or a
Babel-compat escape hatch for the files that need it.

---

## 5b. What we now know (from scoping)

Three answers reshape the strategy:

1. **Fleet is mostly copies of a few apps** (branches/previews of the same 1-5 repos).
2. **Apps use Reanimated + Expo Router** — Babel-level transforms are mandatory.
3. **Servers are mostly idle** — waiting for edits, not constantly bundling.

Implications, in order of impact:

- **The dominant waste is N nearly-identical *idle* processes.** Each holds a
  nearly-identical watch map and module graph while doing nothing. So the biggest win
  is **not** faster bundling (Rust transform speed barely matters for idle servers) —
  it is **holding the shared state once instead of N times**. This points hard at a
  **multi-tenant / shared-base dev server**: the file watch and the base module graph
  for a repo's `node_modules` are resident **once**, and each branch instance carries
  only its small source-code delta. With "mostly copies of a few apps," the shared base
  is almost the entire graph, so this is where the RAM target gets won.

- **Reanimated + Expo Router means we keep Babel for the transform layer** (or a
  strict Babel-compat path). A pure Oxc/Rolldown transformer is a parity risk we should
  not take early. Good news: since the win is architectural (shared state), **we do not
  need a Rust bundler to hit the RAM goal.** Rust becomes an *optional* later
  optimization for the file-map/watcher, not a prerequisite. This de-risks the plan
  substantially.

- **Content-hashed sharing is very effective here.** Because branches share almost all
  bytes, a content-addressable store (Bun/pnpm) plus transform-cache keyed by content
  hash means one transform result serves every branch that hasn't touched that file.

## 5c. Measured findings (see bench/RESULTS.md)

We built three real dev servers and measured RSS. Conclusions:

- **Metro idle is fine (~325-365 MB).** The problem is bundling.
- **A cold bundle transiently spikes to ~2.0 GB** (native and web both), then drains
  over ~20s and **settles at a ~700 MB steady floor** that it holds while alive. Idle
  never returns.
- **A warm-cache rebuild peaks at only ~400 MB** — 5x cheaper than cold. The cache is
  the difference between fine and catastrophic.
- **N concurrent instances scale perfectly linearly with zero sharing**: idle ~0.33 GB
  × N, steady ~0.7 GB × N, concurrent cold-bundle ~1.9 GB × N. Every instance re-crawls
  and re-holds the *identical* node_modules.
- **Vite peaks at 255 MB and never spikes**, because its dev server serves on-demand
  ESM and never assembles one serialized bundle. That is the architectural difference.

**The OOM trigger is a burst of concurrent cold bundles** (deploy, cache eviction, mass
branch update): ~16 simultaneous cold bundles alone will OOM a 32 GB node.

Two levers fall directly out of this, and they are independent:
1. **Kill the cold penalty by sharing a warm cache.** Since the fleet is copies of a few
   apps, a shared content-addressable transform cache means the first bundle of any
   branch is warm (~400 MB) instead of cold (~2 GB). This is a big win *without
   replacing Metro* and should be the first prototype.
2. **Kill the spike entirely by dropping the full-bundle model** for on-demand serving
   (the Vite/vxrn/One direction). This removes the 2 GB transient at the root.

## 6. Proposed direction (updated for the scoping answers)

Sequence the work so we bank the cheap, high-confidence wins first and only take on a
rewrite if the numbers demand it.

**Phase 0 — Measure.** Instrument current Expo/Metro fleet. Fill in the metrics table.
Identify whether RAM is dominated by watchers, graph, or raw Node baseline. This
decides everything downstream.

**Phase 1 — Disk + watch, without changing the bundler.**
- Move installs to a shared content-addressable store (Bun or pnpm; pick via a spike).
- Ensure a single shared Watchman/watch daemon covers the shared store once.
- Squeeze Metro: Watchman on, watched set minimized, caches shared where safe.
- Re-measure. This alone may get the disk goal and a chunk of the RAM goal with low risk.

**Phase 2 — Shared-base / multi-tenant dev server (the main event).**
- Prototype one long-lived process that holds a repo's **file watch + base module graph
  resident once**, and serves many branch instances that each carry only their source
  delta. Benchmark the **N+1 cost** (RAM per additional branch) — that is the number
  that decides fleet density.
- Keep Babel (or a strict Babel-compat path) for the transform layer so Reanimated and
  Expo Router keep working. Cache transform results keyed by content hash so one result
  serves every branch that hasn't touched that file.
- Evaluate whether to build this on top of Metro's internals, or on the
  Vite/Rolldown/Oxc stack (Metro is not designed for multi-tenancy; a custom
  orchestration layer around a Metro-compatible transform may be cleaner).

**Phase 3 — Rust only where it pays (optional).**
- Since the RAM win is architectural, Rust is not required to hit targets. If, after
  Phase 2, the resident file-map/watcher is still a top cost, move *that* to Rust.
- Leave the transform layer on Babel for the Reanimated/Expo Router files; only
  consider Oxc/Rolldown for the non-Babel-sensitive majority of modules.

We do not commit to "rewrite Metro in Rust" up front. Given idle-heavy, copy-heavy
fleets, the leverage is in **sharing resident state**, not transform speed. We escalate
to Rust exactly as far as measurements justify — likely just the watcher, if anything.

---

## 7. Open questions (to resolve next)

1. What is the actual baseline? (Phase 0 — blocks prioritization.)
2. How many distinct apps vs. how many copies of the same app run per box? (If mostly
   copies of a few apps, sharing wins are enormous; if all distinct, less so.)
3. Which install-store: Bun or pnpm? Constraint is RN/Expo resolution compatibility.
4. Do our apps use Reanimated / Expo Router / custom Babel plugins? This sets the
   parity bar for any non-Metro bundler.
5. Are servers mostly idle (waiting for edits) or actively bundling? Idle-heavy fleets
   favor cutting resident memory; bundle-heavy favor faster transforms.
6. Is a multi-tenant single-process model acceptable operationally (blast radius, per-
   tenant isolation), or must each env stay a separate process?

---

## 8. Next step

Answer the "what's it built on / how many apps / which transforms" questions in §7,
then run **Phase 0 measurement** so we design against real numbers. After that we pick
the install-store and the bundler track and open a `DESIGN.md`.
