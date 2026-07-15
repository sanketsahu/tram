import Link from 'next/link'
import { Boxes, Feather, Gauge, Layers, Server, Zap } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { BenchmarkChart } from '@/components/benchmark-chart'
import { Comparison } from '@/components/comparison'
import { Logo } from '@/components/logo'

const STATS = [
  { value: '99.9%', label: 'cross-project cache hit-rate', sub: '1,440 / 1,442 modules · 3 separate projects' },
  { value: '4.3×', label: 'faster bundles', sub: '3,205 ms → 753 ms (cold → cross-project warm)' },
  { value: '~40 MB', label: 'per dev server', sub: 'thin, no Metro · vs Metro ~325 MB idle' },
  { value: '0.38 ms', label: 'warm packed boot', sub: 'vs Metro ~3,130 ms cold bundle' },
]

const FEATURES = [
  { icon: Layers, title: 'node_modules is ~98.5% dead weight', body: 'For a real Expo app only ~8 MB of 539 MB is reachable into the bundle. jetplane splits the immutable vendor layer from the tiny mutable app layer and caches the vendor once.' },
  { icon: Boxes, title: 'Cross-project transform cache', body: 'Transforms are content-addressed by source bytes (root-independent), so the same module transforms once and is reused across different projects — which Metro’s own root-dependent cache cannot do.' },
  { icon: Feather, title: 'Thin, no-Metro dev server', body: 'A pre-built bundle is served from a thin process that mmaps it (shared physical pages). No per-project Metro means ~40 MB per environment instead of ~325 MB idle / ~2 GB cold.' },
  { icon: Zap, title: 'Live HMR, reconstructed', body: 'Fast Refresh works on the thin server: the /hot WebSocket speaks Metro’s protocol and updates are rebuilt from the bundle + the hot transform — validated on device in Expo Go.' },
  { icon: Server, title: 'Shared transform service', body: 'babel’s ~150 MB resident cost is paid once by a shared service that many thin servers call — so per-project memory stays flat and babel is amortized across the whole fleet.' },
  { icon: Gauge, title: 'Built for fleets', body: '~40–55 MB × N + one shared service, versus Metro’s ~325 MB × N idle and ~2 GB × N cold-bundle spikes. A burst of cold bundles is what OOMs a fleet node — jetplane removes it.' },
]

const BTN_PRIMARY = 'inline-flex h-12 items-center justify-center rounded-lg bg-[#2563eb] px-7 text-base font-medium text-white shadow-sm transition-colors hover:bg-[#1d4ed8]'
const BTN_OUTLINE = 'inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card/50 px-7 text-base font-medium text-foreground transition-colors hover:bg-card'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">{children}</p>
}

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        {/* hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
            style={{ background: 'radial-gradient(60% 55% at 50% 0%, rgba(37,99,235,0.18), transparent 70%)' }}
          />
          <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-24 pb-16 text-center sm:pt-32">
            <Logo size={64} className="rounded-2xl shadow-lg shadow-[#2563eb]/20" />
            <span className="mt-7 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-brand" /> Open source · MIT · on npm
            </span>
            <h1 className="mt-6 text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Run dozens of Expo dev servers <span className="text-brand">on one machine</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              jetplane is a <span className="text-foreground">Metro plugin</span> and a{' '}
              <span className="text-foreground">lightweight dev server</span> for Expo &amp; React
              Native. Every same-dep project shares one transform cache, so each environment costs
              about <span className="text-foreground">40 MB</span> — not Metro’s ~325 MB idle / ~2 GB cold.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/docs#quick-start" className={BTN_PRIMARY}>Get started</Link>
              <a href="https://github.com/sanketsahu/jetplane" className={BTN_OUTLINE}>Star on GitHub</a>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-4 py-2.5 font-mono text-sm">
              <span className="select-none text-muted-foreground">$</span>
              <span className="text-brand">npm install jetplane</span>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6">
          {/* benchmark */}
          <section id="benchmark" className="scroll-mt-24 border-t border-border/60 py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <Eyebrow>Benchmark</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Measured against Metro, same machine</h2>
              <p className="mt-3 text-muted-foreground">
                Metro’s real cost isn’t idle — it’s the cold-bundle spike, and it scales linearly with
                zero sharing across servers.
              </p>
            </div>
            <BenchmarkChart />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-card/40 p-5 transition-colors hover:border-brand/40">
                  <div className="text-3xl font-bold tracking-tight text-brand tabular-nums">{s.value}</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{s.label}</div>
                  <div className="mt-1 text-xs leading-snug text-muted-foreground">{s.sub}</div>
                </div>
              ))}
            </div>
          </section>

          {/* how it works */}
          <section className="border-t border-border/60 py-20">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">A dev runtime built on the vendor / app split</h2>
              <p className="mt-3 text-muted-foreground">Validated end-to-end on a real device in Expo Go.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="group rounded-xl border border-border bg-card/40 p-6 transition-colors hover:border-brand/40">
                  <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <f.icon className="size-5" />
                  </div>
                  <h3 className="font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* compatibility */}
          <section id="compatibility" className="scroll-mt-24 border-t border-border/60 py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <Eyebrow>Compatibility</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Is it a drop-in replacement?</h2>
              <p className="mt-3 text-muted-foreground">
                Not wholesale — and it doesn’t need to be. The <span className="text-foreground">cache plugin</span> drops
                into your existing <code className="text-brand">expo start</code> with one line; the experimental{' '}
                <span className="text-foreground">thin serve</span> replaces the dev-server role at ~40 MB. It augments
                Metro; it doesn’t replace the Expo CLI.
              </p>
            </div>
            <Comparison />
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={20} className="rounded-md" /> jetplane — open source (MIT)
          </div>
          <div className="flex items-center gap-5">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <a href="https://github.com/sanketsahu/jetplane" className="hover:text-foreground">GitHub</a>
            <a href="https://www.npmjs.com/package/jetplane" className="hover:text-foreground">npm</a>
          </div>
        </div>
      </footer>
    </>
  )
}
