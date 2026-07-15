# Vite adapter findings (honest, includes a negative result)

Measured with a browser-like module-graph crawl (`bench/boot-crawl.mjs`), not a single
curl. boot-to-loaded = spawn -> every module reachable from index.html served.

## Results (vite-app, 22 modules)

| case | firstByte | loaded |
|---|---:|---:|
| plain vite: cold | 293 ms | 416 ms |
| plain vite: warm | 221 ms | 291 ms |
| tram: cold | 278 ms | 377 ms |
| tram: warm (same project) | 178 ms | 291 ms |
| **tram: warm (diff project, same deps)** | **2176 ms** | **2333 ms** |

Disk: tram shared `~/.tram/vite` = 3.6 MB for ALL same-dep projects; plain = 3.6 MB
per project.

## What this means

1. **The optimizeDeps-cacheDir-sharing lever is WRONG.** Vite 8's prebundle is validated
   by a `browserHash` that includes the project root/config. Pointing a second project at
   the first project's shared cacheDir triggers a full **re-optimize** (2.3 s, 8x slower
   than plain warm). Sharing across roots backfires. This is the exact fleet scenario we
   care about, and it regressed.
2. **tram adds nothing on same-project** — its "warm" (291 ms) is just Vite's own cache.
3. **Only disk dedup is a real (modest) win.**
4. **Vite 8 (Rolldown, Rust) is already lean**: 416 ms cold, 3.6 MB prebundle, and — unlike
   Metro — no memory spike anywhere. The headroom on Vite is small.

## Correct path for a Vite win (not yet built)

Do NOT piggyback Vite's optimizeDeps. Instead apply the mechanism the prototype PROVED:
serve vendor from tram's own **content-addressed, packed** store via the plugin's
`resolveId`/`load` hooks. Because it is content-addressed (keyed by module bytes, not
project root), cross-project reuse is correct and root-independent — the thing Vite's own
cacheDir cannot do. This bypasses Vite's per-project optimize+validation entirely.

## Strategic note

The 2 GB spike / linear-memory problem that started this project is **Metro's, not
Vite's**. Vite is already fast and lean. The proven packed-store mechanism has the most
leverage on Expo/Metro. Decision pending: invest the packed-vendor-serving work into the
Vite adapter, or validate it first where it actually matters (Expo).
