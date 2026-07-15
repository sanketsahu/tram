import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'

export const metadata: Metadata = {
  title: 'Docs — jetplane',
  description: 'How jetplane makes Expo/React Native dev servers cheap: the vendor/app split, cross-project cache, thin no-Metro server, and HMR.',
}

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'problem', title: 'The problem' },
  { id: 'principle', title: 'First principle' },
  { id: 'architecture', title: 'Architecture' },
  { id: 'hmr', title: 'HMR' },
  { id: 'run', title: 'Running it' },
  { id: 'benchmark', title: 'Benchmark methodology' },
  { id: 'roadmap', title: 'Status & roadmap' },
]

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 pt-10 text-2xl font-semibold tracking-tight text-foreground first:pt-0">
      {children}
    </h2>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed text-muted-foreground">{children}</p>
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-card/50 p-4 font-mono text-sm text-foreground/90">
      <code>{children}</code>
    </pre>
  )
}

export default function Docs() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-6 py-12">
        <aside className="hidden w-48 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <H id="overview">Overview</H>
          <P>
            jetplane is a low-footprint dev/bundling toolchain for Expo/React Native (and Vite), built
            for running many dev environments per machine. It gives React Native a cross-project
            transform cache and a thin, no-Metro dev server, so each environment costs about 40 MB
            instead of Metro’s ~325 MB idle / ~2 GB cold. Everything here is measured; the on-device
            HMR demo is real. It is a research WIP.
          </P>

          <H id="problem">The problem</H>
          <P>
            Metro runs one process per dev server. Idle it holds ~325 MB, but the moment it builds a
            bundle with a cold cache it transiently spikes to ~2 GB and then holds a ~700 MB floor.
            N servers scale linearly with zero sharing — measured. The trigger that OOMs a fleet node
            is a burst of concurrent cold bundles (a deploy, a cache eviction, a mass branch update),
            each costing ~2 GB.
          </P>

          <H id="principle">First principle</H>
          <P>
            For one Expo app, node_modules is 539 MB / ~33,000 files / 365 packages — but only 65
            packages / 1,664 modules / ~8 MB are actually reachable into the bundle. ~98.5% of
            node_modules never ships. The code you edit is ~19 files. So a dev bundle is really two
            layers with opposite properties: an immutable <strong>vendor</strong> layer (huge,
            identical across branches, never edited) and a mutable <strong>app</strong> layer (tiny,
            unique, edited constantly). Metro treats them the same — one watcher, one graph, one heap,
            per process. jetplane exploits the asymmetry.
          </P>

          <H id="architecture">Architecture</H>
          <P>
            <strong>Cross-project cache.</strong> Transforms are content-addressed by source bytes
            (root-independent), so the same vendor module transforms once and is reused across
            different projects. Metro’s own transform cache keys are root-dependent, so it cannot do
            this — proven by a second project doubling Metro’s cache instead of reusing it. jetplane
            injects the cache at Metro’s transformer seam (a custom <code>transformerPath</code>)
            that normalizes the project root out on write and rehydrates it on read.
          </P>
          <P>
            <strong>Shared transform service.</strong> babel’s ~150 MB resident cost is the real
            per-project memory hog, not the vendor. One shared service pays it once and serves N thin
            servers, so per-project memory stays flat.
          </P>
          <P>
            <strong>Thin, no-Metro server.</strong> The pre-built bundle is served from a thin Bun
            process that <code>mmap</code>s it (shared physical pages across processes). No per-project
            Metro → ~40 MB per environment. The build (heavy, once) happens at container-build /
            pre-warm time — matching a fleet that ships a pre-built cache.
          </P>

          <H id="hmr">HMR</H>
          <P>
            The pre-built bundle carries <code>__d(factory, id, [deps], &quot;path&quot;)</code> for
            every module, so path→id, id→deps and inverse-deps are recovered by parsing it. The
            thin server’s <code>/hot</code> WebSocket speaks Metro’s protocol
            (<code>register-entrypoints</code> → <code>bundle-registered</code>, then
            <code>update-start</code>/<code>update</code>/<code>update-done</code>). On an edit it
            transforms the file (hot, React Refresh), wraps it with the right id + dependencyMap +
            inverse-deps, and sends any new helper modules the transform pulled in as
            <code>added</code>. Validated on device in Expo Go — the title hot-swaps without a reload.
          </P>

          <H id="run">Running it</H>
          <P>The jetplane tooling lives in <code>src/</code>. To reproduce the on-device demo:</P>
          <Code>{`# 1. an Expo SDK 54 app with the jetplane transformer wired in (bench/expo-app-54)
cd bench/expo-app-54 && npx expo start   # first run builds the shared cache

# 2. a second project reuses the cache cross-project (99.9% hits)
cd bench/expo-app-54-b && npx expo start

# 3. capture a bundle, serve it from the thin no-Metro server + HMR
bun src/jetplane-serve-thin.ts bench/expo-app-54 8091
#   scan the QR in Expo Go, then edit app/(tabs)/index.tsx to see live HMR`}</Code>

          <H id="benchmark">Benchmark methodology</H>
          <P>
            All numbers are resident memory of the whole dev-server process tree (<code>ps</code> RSS),
            on Apple Silicon / macOS 15. Memory is separated into idle vs peak (Metro’s cold bundle;
            others under first load). Cache hit-rate is measured by the transformer worker’s own
            hit/miss telemetry, reset per bundle. Harnesses and raw results are in{' '}
            <a className="text-brand hover:text-brand-hover" href="https://github.com/sanketsahu/jetplane/tree/main/bench">bench/</a>{' '}
            (<code>RESULTS.md</code>, <code>METRO-CACHE-RESULTS.md</code>, <code>PATH2-FINDINGS.md</code>,
            <code>ON-DEVICE-VALIDATION.md</code>).
          </P>

          <H id="roadmap">Status &amp; roadmap</H>
          <P>
            Research WIP. Proven: the vendor/app split, cross-project cache (99.9% on device), thin
            server memory, and live HMR. Remaining: multi-level new-dep + deletion handling in HMR,
            routing HMR transforms through the shared service, the 0.2% worklet path-normalization
            gap, app-layer cache-vary for env inlining, and a clean{' '}
            <code>jetplane build</code>/<code>serve</code>/<code>dev</code> command surface.
          </P>

          <div className="mt-12 border-t border-border pt-6">
            <Link href="/" className="text-sm text-brand hover:text-brand-hover">← Back home</Link>
          </div>
        </article>
      </div>
    </>
  )
}
