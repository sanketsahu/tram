# Tram — Shared / distributed transform cache

Extends `CACHE-MODEL.md`. The global content-addressed transform store (H1) does not
have to be local. It can be tiered up to an org cache and a global CDN, so a transform
computed by anyone is reusable by everyone with the same inputs.

This is powerful and precedented, but the global public tier has two hard problems
(reproducibility and trust) and one empirical blocker (transform portability) that must
be solved first. This document is honest about all three.

---

## 0. The empirical blocker (measured)

We inspected a real Metro dev bundle:

- **Portable:** modules use **numeric ids** with integer dependency edges
  (`__d(factory, 1, [2,739,1661])`). 1,663 modules. Graph shape travels fine.
- **NOT portable:** the output bakes in **957 absolute project paths**
  (`/Users/.../expo-app/node_modules/react-native-reanimated/src/.../clamp.ts`), from
  dev sourceURL metadata and Reanimated worklets serializing source locations.

Consequence: the current dev transform output is **not content-addressable across
paths**, which breaks sharing even between two local branches at different checkout
paths, not just across machines.

Two requirements fall out:

1. **Shared store path enables local sharing.** If every branch resolves vendor through
   one canonical pnpm/bun store path, the baked path is identical across branches on a
   box, so content hits work locally. Disk dedup and cache sharing are the same lever.
2. **Hermetic, path-normalized transforms are a prerequisite for the org/global tiers.**
   Vendor modules must be addressed and emitted **package-relative**
   (`react-native-reanimated@4.5.0/src/animation/clamp.ts`), never project-relative.
   This is why the shared tier cannot reuse Metro's project-centric serializer as-is.

---

## 1. Prior art (this is not novel in shape)

- **Nix / Cachix** — input-addressed global store + CDN substituters. Closest match.
- **Turborepo / Vercel Remote Cache, Bazel remote cache, sccache** — team-shared build
  outputs keyed by content hash. Proven at scale.
- **esm.sh / Skypack / jsDelivr-esm** — CDN-served transformed npm modules, for web.

Novel part: **there is no esm.sh equivalent for React Native transforms.** The RN angle
is real new value.

---

## 2. Tiers (miss cascades down)

```
request module (contentHash + transformOptions)
  → L1 local store        (this box; fastest; also the pnpm/bun store synergy)
  → L2 org cache          (team/fleet; S3/CDN; private deps + shared vendor)
  → L3 global public CDN  (public-registry-derived transforms only)
  → miss: transform locally, then populate L1 (+ L2/L3 if policy allows)
```

L1/L2 are low-risk: a remote build cache, already proven by Turbo/Bazel/Nix. L3 public
is the ambitious tier and carries the hard problems below.

---

## 3. Hard problem A — reproducibility (Nix-level discipline)

The cache key must hash the **full input closure**, or entries collide unsafely:

```
key = hash(
  normalizedSourceBytes,          // path-normalized per §0
  transformerVersion,             // Tram's transformer identity
  babelPluginVersionsAndConfig,   // every plugin + its config
  options                         // platform × engine × dev/prod × reactCompiler × ...
)
```

Any nondeterminism (absolute paths, timestamps, map ordering, locale, plugin version
drift) poisons the cache. This is exactly the hermetic-build requirement Nix enforces.
When the transformer or a plugin updates, keys change and old entries remain valid for
old toolchain pins.

---

## 4. Hard problem B — trust / supply chain (the dangerous part)

**The output hash is not the input hash.** Fetching a transform *output* keyed by the
*input* hash means trusting that whoever populated the entry ran the real transformer and
injected nothing. A publicly-writable global cache of executable transformed code is a
malware distribution vector.

Viable form (not a wide-open bucket):

- **Signed trusted builders.** Only signed builders may publish to the public tier
  (Cachix / npm-provenance / Sigstore model). Clients verify signatures.
- **Verify-by-recompute.** Because transforms are reproducible (§3), a client can
  re-derive any entry locally and confirm the bytes match — trust is optional, not
  mandatory.
- **Restricted writes + audit.** Public-tier writes are gated and logged; anyone can
  challenge an entry by recomputation.

Content addressing gives integrity of **bytes**, not integrity of **intent**. Signing +
reproducibility is what closes that gap.

---

## 5. Privacy boundary (non-negotiable)

- **Public tier (L3):** only transforms whose **source is a verbatim public-registry
  artifact**, checkable by hashing the input against the npm tarball. Nothing else.
- **App source and private deps:** never leave L1/L2. Ever.
- **Tree traces (reachable set per app):** mildly sensitive (reveals dependency usage).
  Keep org-tier or anonymized/opt-in. Payoff: **predictive prefetch** — warm the base
  image for a lockfile before the app asks.

The enforceable rule: an entry may go public **iff** its input is byte-identical to a
public registry artifact.

---

## 6. Positioning (do not overclaim)

This does **not** replace npm. npm remains the source of truth and the provenance anchor
you verify against; you still need the raw bytes to reproduce and check. Tram's shared
cache is a **transform + resolution acceleration and distribution layer in front of
npm** — "Nix cache for JS/RN transforms, served like esm.sh." The dependency on npm is
what makes it safe: you can always re-derive and verify against the registry.

---

## 7. What to prove before building the shared tier

1. **Path-normalized transforms are achievable** for the RN toolchain, including
   Reanimated worklets and any plugin that embeds source locations. This is the §0
   blocker and the first thing to prototype.
2. **Bit-for-bit reproducibility** across two machines for a fixed toolchain pin. Diff
   the normalized output; it must be identical.
3. **Hit-rate model.** For standard Expo defaults, how much of the reachable set is
   public-registry-derived and therefore L3-eligible? (Earlier: 65 packages / 1,664
   modules reachable — estimate what fraction is stock npm vs app/private.)
4. **Trust model spike.** Signed-builder publish + client verify-by-recompute on a
   handful of packages.
