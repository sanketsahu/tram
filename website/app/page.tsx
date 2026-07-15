import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'
import { BenchmarkChart } from '@/components/benchmark-chart'
import { Comparison } from '@/components/comparison'
import { Button } from '@/components/ui/button'

const STATS = [
  { value: '99.9%', label: 'cross-project cache hit-rate', sub: '1,440 / 1,442 modules · 3 separate projects' },
  { value: '4.3×', label: 'faster bundles', sub: '3,205 ms → 753 ms (cold → cross-project warm)' },
  { value: '~40 MB', label: 'per dev server', sub: 'thin, no Metro · vs Metro ~325 MB idle' },
  { value: '0.38 ms', label: 'warm packed boot', sub: 'vs Metro ~3,130 ms cold bundle' },
]

const FEATURES = [
  {
    title: 'node_modules is ~98.5% dead weight',
    body: 'For a real Expo app only ~8 MB of 539 MB is reachable into the bundle. jetplane splits the immutable vendor layer from the tiny mutable app layer and caches the vendor once.',
  },
  {
    title: 'Cross-project transform cache',
    body: 'Transforms are content-addressed by source bytes (root-independent), so the same module transforms once and is reused across different projects — the cross-project cache Metro’s own root-dependent cache cannot provide.',
  },
  {
    title: 'Thin, no-Metro dev server',
    body: 'A pre-built bundle is served from a thin Bun process that mmaps it (shared physical pages). No per-project Metro means ~40 MB per environment instead of ~325 MB idle / ~2 GB cold.',
  },
  {
    title: 'Live HMR, reconstructed',
    body: 'Fast Refresh works on the thin server: the /hot WebSocket speaks Metro’s protocol and updates are rebuilt from parsing the bundle + the hot transform — validated on device in Expo Go.',
  },
  {
    title: 'Shared transform service',
    body: 'babel’s ~150 MB resident cost is paid once by a shared service that many thin servers call — so per-project memory stays flat and babel is amortized across the whole fleet.',
  },
  {
    title: 'Built for fleets',
    body: 'Cost model: ~40–55 MB × N + one shared service, versus Metro’s ~325 MB × N idle and ~2 GB × N cold-bundle spikes. A burst of cold bundles is what OOMs a fleet node — jetplane removes it.',
  },
]

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {/* hero */}
        <section className="flex flex-col items-center py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" /> Research · open source
          </span>
          <h1 className="mt-6 max-w-4xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Run dozens of Expo dev servers <span className="text-brand">on one machine</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            jetplane gives React Native a cross-project transform cache and a thin, no-Metro dev
            server — so each environment costs about <span className="text-foreground">40 MB</span> instead
            of Metro’s ~325 MB idle / ~2 GB cold. Live HMR included.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
              <Link href="/docs">Read the docs</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="https://github.com/sanketsahu/jetplane">Star on GitHub</a>
            </Button>
          </div>
          <code className="mt-8 rounded-lg border border-border bg-card/50 px-4 py-2.5 font-mono text-sm text-brand">
            jetplane dev
          </code>
        </section>

        {/* benchmark — lead with the proof */}
        <section id="benchmark" className="scroll-mt-20 pb-14">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">The benchmark</h2>
            <p className="mt-3 text-muted-foreground">
              Metro’s real cost isn’t idle — it’s the cold-bundle spike, and it scales linearly with
              zero sharing across servers. jetplane is measured against it on the same machine.
            </p>
          </div>
          <BenchmarkChart />
        </section>

        {/* stat tiles */}
        <section className="grid grid-cols-2 gap-3 pb-8 sm:grid-cols-4 sm:gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card/40 p-5">
              <div className="text-3xl font-bold tracking-tight text-brand tabular-nums">{s.value}</div>
              <div className="mt-1 text-sm font-medium text-foreground">{s.label}</div>
              <div className="mt-1 text-xs leading-snug text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </section>

        {/* how it works */}
        <section className="py-8 pb-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <p className="mt-3 text-muted-foreground">
              A dev runtime built around the immutable/mutable split — validated end-to-end on a real
              device in Expo Go.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card/40 p-6">
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* compatibility / comparison */}
        <section id="compatibility" className="scroll-mt-20 pb-20">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Is it a drop-in replacement?</h2>
            <p className="mt-3 text-muted-foreground">
              Not wholesale — and it doesn’t need to be. jetplane is a caching + serve layer with two
              modes: a <span className="text-foreground">cache plugin</span> that drops into your
              existing <code className="text-brand">expo start</code> with one line, and an
              experimental <span className="text-foreground">thin serve</span> that replaces the
              dev-server role at ~40 MB. It augments Metro; it doesn’t replace the Expo CLI.
            </p>
          </div>
          <Comparison />
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>jetplane — research WIP. Not affiliated with Meta, Expo, or the React Native team.</span>
          <div className="flex items-center gap-5">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <a href="https://github.com/sanketsahu/jetplane" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </>
  )
}
