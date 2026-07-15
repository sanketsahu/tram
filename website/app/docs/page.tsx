import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { Code as Highlight } from '@/components/code'

export const metadata: Metadata = {
  title: 'Docs — jetplane',
  description: 'How jetplane makes Expo/React Native dev servers cheap: the vendor/app split, cross-project cache, thin no-Metro server, and HMR.',
}

const SECTIONS = [
  { id: 'quick-start', title: 'Quick start' },
  { id: 'what', title: 'What it is' },
  { id: 'problem', title: 'The problem' },
  { id: 'principle', title: 'First principle' },
  { id: 'architecture', title: 'Architecture' },
  { id: 'hmr', title: 'HMR' },
  { id: 'thin', title: 'Thin dev server' },
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
async function Code({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return <Highlight code={String(children).trim()} lang={lang} className="mt-4" />
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
          <H id="quick-start">Quick start</H>
          <P>
            Add jetplane to an existing Expo project. No workflow change — you keep using{' '}
            <code>expo start</code>.
          </P>
          <Code>{`# 1. install as a dev dependency (Metro resolves the plugin from here)
npm install -D jetplane

# 2. wire it into metro.config.js
#    (creates the file, or prints the 2 lines to add if you already have one)
npx jetplane init

# 3. run your app as usual — now cross-project cached
npx expo start`}</Code>
          <P>
            <code>jetplane init</code> adds two lines to your Metro config:
          </P>
          <Code lang="js">{`// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.transformerPath = require.resolve('jetplane/transformer') // the Metro plugin
config.cacheStores = []                                          // jetplane owns caching

module.exports = config`}</Code>
          <P>
            That’s the whole integration. The first bundle populates a shared, content-addressed
            cache under <code>~/.jetplane</code>; every other same-dep project (and every restart)
            reuses it, so cold bundles stop re-transforming <code>node_modules</code>. Requires
            Expo SDK 54+, Node 20+.
          </P>

          <H id="what">What it is</H>
          <P>
            jetplane is two things: a <strong>Metro plugin</strong> (a custom{' '}
            <code>transformerPath</code>) that gives React Native a cross-project transform cache
            Metro’s own root-dependent cache can’t provide; and a <strong>lightweight, no-Metro dev
            server</strong> that serves a pre-built bundle from a ~40 MB process with live HMR, for
            running many environments per machine.
          </P>
          <P>
            It <strong>augments Metro</strong> — it is not a replacement for the Expo CLI. The plugin
            mode is fully drop-in with <code>expo start</code>; the thin-serve mode is a separate,
            experimental command. See the full{' '}
            <Link href="/#compatibility" className="text-brand hover:text-brand-hover">comparison</Link>.
            Open source under MIT.
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

          <H id="thin">Thin dev server (experimental)</H>
          <P>
            Beyond the plugin, jetplane can serve a pre-built bundle from a ~40 MB no-Metro process
            with live HMR — for running many environments per machine. One command sets it up:
          </P>
          <Code>{`npx jetplane dev`}</Code>
          <P>
            <code>jetplane dev</code> is the unified one-liner for a fresh project: it (1) ensures the
            plugin is in your <code>metro.config.js</code>, (2) installs dependencies if needed, (3)
            builds a device-bootable bundle once (running Metro a single time), then (4) serves it from
            the thin, no-Metro server and prints a QR for Expo Go — edit{' '}
            <code>app/(tabs)/index.tsx</code> and it hot-reloads. Requires Bun; it replaces the
            dev-server role, not the Expo CLI. (<code>jetplane start</code> is an alias.)
          </P>
          <P>
            The three commands, from least to most: <code>jetplane init</code> just wires the cache
            into your config; <code>jetplane serve</code> runs the thin server for a project that’s
            already set up; <code>jetplane dev</code> does the whole fresh-project setup and then
            serves. Running <code>jetplane</code> with no argument prints help.
          </P>

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
            Open source under MIT and published on npm (<code>jetplane</code>). Shipping today: the
            Metro plugin (cross-project cache, drop-in with <code>expo start</code>) — measured at a
            99.9% cross-project hit-rate on device. The thin dev server + HMR is experimental.
          </P>
          <P>
            On the roadmap: multi-level new-dep + deletion handling in HMR, routing HMR transforms
            through the shared service, closing the 0.2% worklet path-normalization gap, app-layer
            cache-vary for env inlining, and a first-class <code>jetplane serve</code> command.
            Contributions welcome on{' '}
            <a className="text-brand hover:text-brand-hover" href="https://github.com/sanketsahu/jetplane">GitHub</a>.
          </P>

          <div className="mt-12 border-t border-border pt-6">
            <Link href="/" className="text-sm text-brand hover:text-brand-hover">← Back home</Link>
          </div>
        </article>
      </div>
      <SiteFooter />
    </>
  )
}
