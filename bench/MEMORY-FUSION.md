# Memory fusion — thin serve of the pre-built cross-project-cached bundle

Combines the two proven halves: (1) cross-project cache (device-bootable, via the Metro
worker) builds the bundle once; (2) a thin Bun server mmap-serves it with NO per-project
Metro.

## Build phase (once, warm)

`expo-app-54` with the tram worker, warm cache -> captured the device-bootable dev bundle
+ manifest in **1362 ms** (99.9% cache hits):
- `~/.tram/images/expo54/main.ios.bundle` (8.1 MB JS)
- `~/.tram/images/expo54/manifest.json` (application/expo+json)

## Serve phase (runtime, thin) — `src/tram-serve-thin.ts`

Bun server, mmap'd bundle, serves the full Expo dev protocol:

| endpoint | result |
|---|---|
| `/status` | packager-status:running |
| `/` (manifest) | 200, application/expo+json, launchAsset host rewritten to caller |
| `*.bundle` | 200, 8.1 MB, application/javascript (valid JS) |
| `/assets/*` | best-effort from project |

| memory | thin server | Metro |
|---|---:|---:|
| idle | **28.8 MB** | ~325 MB |
| serving bundle | **45 MB** | ~2 GB cold |

No Metro process. Bundle mmap'd -> shared physical pages across processes.

## Scope / honesty

- This mode serves a STATIC pre-built bundle (no live HMR) — the "spin up a dev env and
  load the app" case, which is the fleet scenario (idle envs, killed Metros). Active
  editing still needs the transform path.
- Device boot via Expo Go: connect to the thin server's URL (see below). Manifest +
  content-type replayed exactly; unsigned local dev manifest.
- Log/inspector websockets not served (app boots; logs/HMR channels absent by design).

## VALIDATED ON DEVICE ✓

App booted in Expo Go from the thin server (no Metro). Fix that made it work: Expo Go
(dev) requests `multipart/mixed` and rejects plain JSON as a "legacy manifest"; the thin
server now replays the exact captured multipart response (`expo-protocol-version: 0`,
`boundary=formdata-…`, manifest as a form-data part) with the host rewritten to the
caller. QR generated via `qrcode-terminal`.

| stage | thin server RSS | Metro equivalent |
|---|---:|---:|
| idle | ~30 MB | ~325 MB |
| after serving bundle to device | **59 MB** | ~2 GB cold |

The complete thesis, running on hardware: PRE-BUILT cross-project-cached bundle (built
once at 99.9% hits) served from a ~30-59 MB no-Metro process, booting in Expo Go.

## HMR ON DEVICE ✓ (added after fusion)

Live Hot Module Replacement works on the thin no-Metro server, validated on device:
edit `app/(tabs)/index.tsx` -> title hot-swaps via React Refresh, no full reload.

How it works (all reconstructed from the pre-built bundle, no Metro running):
- The bundle carries `__d(factory, id, [deps], "path")` for every module, so we recover
  path->id, id->deps, and id->inverseDeps by parsing it.
- `/hot` WebSocket speaks Metro's protocol: `register-entrypoints` -> `bundle-registered`,
  then on an app-file edit `update-start` / `update` / `update-done`.
- On edit: transform the file with `metro-transform-worker` (hot, React Refresh), wrap as
  `__d(...)` with the bundle's id + resolved dependencyMap + verboseName +
  inverseDependenciesById (via `addParamsToDefineCall`).

Two bugs found and fixed via on-device iteration:
1. **Legacy manifest** — Expo Go wants `multipart/mixed`; we now replay the exact
   multipart manifest, with fresh `id`/`createdAt` per load (else expo-updates SQLite
   UNIQUE(scope_key, commit_time) collides on re-scan).
2. **`_interopRequireDefault is not a function`** — the hot (React Refresh) transform
   pulls in `@babel/runtime/helpers/interopRequireDefault`, a module NOT in the pre-built
   bundle. Fixed by resolving the hot transform's own dep names to ids and sending any
   new modules in the update's `added` array (with fresh ids) — standard Metro HMR delta
   behavior. Edit -> `hmr: pushed module 1420, +1 new` -> React Refresh applies.

## How to scan (validate on device)

```
bun src/tram-serve-thin.ts bench/expo-app-54 8091
```
- Simulator: open `exp://localhost:8091` in Expo Go
- Phone (same Wi-Fi): Expo Go -> "Enter URL manually" -> `exp://10.148.1.9:8091`
