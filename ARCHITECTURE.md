# Tram — Architecture

The converged design. Supersedes the "which bundler / resident server" framing in
earlier docs. See `FIRST-PRINCIPLES.md` (why), `CACHE-MODEL.md` (invalidation),
`SHARED-CACHE.md` (distribution), `prototype/RESULTS.md` (proof at 12,823 modules).

---

## 1. What Tram is

**One tool that installs dependencies and runs the dev server, backed by a global,
system-wide, content-addressed cache.** It is framework-agnostic: a shared core with thin
adapters for Vite, Expo, and (later) Next.

Not a daemon, not a resident multi-tenant server, no process management. Each `tram`
invocation is its own process. Sharing happens through the **cache on disk** (and the OS
page cache via mmap), not through a coordinating server. Run it twice, or across ten
projects, and every run reuses the same store.

```
tram dev                     # detect framework, ensure deps, run cache-backed dev server
tram dev --framework vite    # force framework
tram install                 # just resolve + install + distill vendor image (optional)

# escape hatch: the Vite adapter is a plugin, usable without the runner
# vite.config.ts
import { tram } from 'tram/vite'
export default { plugins: [tram()] }
```

---

## 2. Layers

```
 CLI              tram dev  (detect framework: vite | expo | next)
   |
 Adapters         vite adapter (= Vite plugin)   expo adapter (Metro/RN transform + esm.reactnative.run)
   |                         \                   /
 Core             ┌───────────────────────────────────────────────┐
                  │ installer  (bun | pnpm | npm, -> shared store)  │
                  │ resolver   (specifier -> path, per lockfile)    │
                  │ transformer(oxc/esbuild for web; babel-fidelity │
                  │             for RN app layer)                   │
                  │ store      (H1: hash(src+opts) -> transformed)  │
                  │ manifest   (H2: lockfileHash -> path->hash)     │
                  │ packer     (base image: one mmap-able blob)     │
                  └───────────────────────────────────────────────┘
   |
 System           ~/.tram/store   (content-addressed, shared across ALL projects)
                  ~/.tram/images  (packed base images, mmap'd read-only)
```

The **value is the core + the shared cache**, not the CLI. Adapters are small; each
framework is "how do I get this framework to fetch modules from the Tram core."

---

## 3. Tram owns install

No manual `npm install`. Consequences:

- **Pluggable installer backend.** tram picks the fastest available (bun > pnpm > npm),
  installs into a **shared global store** (hardlinks / content-addressed), so disk
  dedupes across every project on the machine. Backend choice is invisible to the user.
- **tram controls the lockfile hash**, which is the `manifest` key (H2). No
  reverse-engineering of a package manager's layout.
- **Install is when the vendor image is built/warmed.** First `tram dev` is already hot.
- **Re-install = incremental.** A new/changed dep re-derives the manifest; only changed
  modules re-transform (content-addressed); the base image re-packs incrementally
  (base + increments). Unchanged modules stay cache hits, shared fleet-wide.

---

## 4. Cache-bust triggers (all automatic)

| trigger | what changes | cost |
|---|---|---|
| edit an app file | that module's content hash | 1 transform (~2 ms) |
| reach a new module (new tree-trace) | app's reachable set grows | resolve + 1 transform, or a store hit |
| `tram` re-install (new/changed dep) | lockfileHash → new manifest | transform only changed modules; re-pack |

Content addressing means every bust is O(changed), never O(graph). Proven: ~2 ms against
a 12,823-module graph.

---

## 5. Memory model without a server

- Each process holds baseline + the packed image. No cold-bundle spike (cache hits), so
  none of the ~2 GB Metro transient.
- **mmap the packed vendor image read-only** → OS page cache dedupes physical pages
  across every independent `tram` process. This is how the "2.1 GB → 11 MB for 200 envs"
  result is reached with zero coordination. Without mmap it degrades gracefully to
  ~image-size per process (still 10-100× better than Metro).
- Runtime: **Bun preferred** for the runner (`Bun.mmap`, fast startup). Node works with a
  small mmap addon. The installer backend is independent of the runner choice.

---

## 6. The one architectural rule that must hold

The base image is a **lazily-populated cache + a live resolver, never a sealed closure**
(`CACHE-MODEL.md`). And transforms must be **hermetic / path-normalized** so the same
input yields byte-identical output across paths and machines — required for local
cross-project sharing and mandatory for the org/global CDN tier (`SHARED-CACHE.md`). The
957 absolute paths we found in Metro's output are the concrete thing to eliminate.

---

## 7. Build order

1. **Core**: store (H1) + manifest (H2) + packer + transformer + resolver. (Prototype
   already has store/packer/transform; harden and factor into the core.)
2. **Installer**: backend abstraction (bun/pnpm/npm) → shared store; produce lockfileHash;
   distill + pack vendor image at install time.
3. **Vite adapter** (plugin): serve vendor from the Tram image (externalized from Vite),
   let Vite own the app layer + HMR. `tram dev` detection.
4. **Measure** vs plain Vite: boot, memory (with/without mmap), HMR latency, cache-bust,
   disk. Confirm the prototype numbers hold as a real dev server.
5. **Expo adapter**: reuse the core; vendor via native transform + esm.reactnative.run;
   app layer keeps Babel fidelity (Reanimated, Expo Router).

Vite first (steps 1-4), Expo next (step 5), global CDN on the roadmap
(`SHARED-CACHE.md`).
