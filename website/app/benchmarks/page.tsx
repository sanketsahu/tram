import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { HitMissBars, MemoryChart, Bars } from '@/components/bench-charts'

export const metadata: Metadata = {
  title: 'Benchmarks — jetplane',
  description:
    'Measured cases: the cross-project transform cache (99.9% hits across same-dep projects), installing a new package (incremental — only that package re-transforms), and thin-serve vs Metro dev-server memory.',
}

const SECTIONS = [
  { id: 'method', title: 'Method' },
  { id: 'case-1', title: 'Case 1 · Cross-project cache' },
  { id: 'case-2', title: 'Case 2 · New package' },
  { id: 'case-2-memory', title: 'Case 2 · Memory' },
  { id: 'caveats', title: 'Caveats' },
  { id: 'reproduce', title: 'Reproduce' },
]

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 pt-12 text-2xl font-semibold tracking-tight text-foreground first:pt-0">
      {children}
    </h2>
  )
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-8 text-lg font-semibold tracking-tight text-foreground">{children}</h3>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed text-muted-foreground">{children}</p>
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-brand">{children}</div>
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-card/50 text-left">
            {head.map((h, i) => (
              <th key={i} className={'px-3 py-2 font-medium text-muted-foreground ' + (i === 0 ? '' : 'text-right')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/60 last:border-0">
              {r.map((c, ci) => (
                <td key={ci} className={'px-3 py-2 tabular-nums ' + (ci === 0 ? 'text-foreground/90' : 'text-right text-muted-foreground')}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm leading-relaxed text-foreground/90">
      {children}
    </div>
  )
}

export default function Benchmarks() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-6 py-12">
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <Eyebrow>Benchmarks</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            What the cache and the thin server actually cost
          </h1>
          <P>
            Two measured cases on real Expo SDK&nbsp;54 apps. <strong className="text-foreground">Case 1</strong> is the
            cross-project transform cache: separate projects with the same dependencies share one content-addressed
            store, so the second and third pay almost nothing. <strong className="text-foreground">Case 2</strong> asks
            the follow-up question — <em>what happens when you install a new package?</em> — and compares the two
            serving paths (Metro vs jetplane&rsquo;s thin server) on memory.
          </P>

          <H id="method">Method</H>
          <P>
            Every number below is measured on the same machine — Apple&nbsp;Silicon · macOS. Memory is resident set size
            of the whole dev-server process tree (<code>ps</code> RSS). Cache hits/misses come from the transform
            worker&rsquo;s own telemetry (one <code>H</code>/<code>M</code> per module transform, tallied per bundle). A
            &ldquo;module&rdquo; is one file the bundler transforms; a &ldquo;miss&rdquo; means it actually ran the
            transform, a &ldquo;hit&rdquo; means it was reused from the shared cache. Each project is wired the way{' '}
            <code>jetplane init</code> writes <code>metro.config.js</code> (jetplane&rsquo;s worker chained over
            Expo&rsquo;s default transformer).
          </P>

          {/* ── CASE 1 ────────────────────────────────────────────────────── */}
          <H id="case-1">Case 1 · Cross-project cache</H>
          <P>
            Three identical-dependency SDK&nbsp;54 apps, one shared cache starting empty. Build project&nbsp;A, then B,
            then C. A is cold and pays the full transform cost while populating the store; B and C reuse it — the key is
            root-independent, so the <em>same</em> module transformed under A is reused under B and C.
          </P>

          <HitMissBars
            caption="Transforms reused across projects — hits vs misses"
            rows={[
              { name: 'project A', sub: 'cold — builds cache', total: 1442, hits: 0 },
              { name: 'project B', sub: 'same deps', total: 1442, hits: 1440, self: true },
              { name: 'project C', sub: 'same deps', total: 1442, hits: 1440, self: true },
            ]}
            footnote={<>B and C miss only the 2 modules that genuinely differ per project; everything else is a hit.</>}
          />

          <Bars
            caption="Cold-cache bundle time vs warm-cache (ms · lower is better)"
            unit="ms"
            rows={[
              { name: 'project A', sub: 'cold', value: 4973 },
              { name: 'project B', sub: 'warm', value: 1710, self: true },
              { name: 'project C', sub: 'warm', value: 1799, self: true },
            ]}
            footnote={<>The ~2.8× speedup is explained by the hit count — 99.9% of transforms never ran.</>}
          />

          <Table
            head={['project', 'modules', 'hits', 'misses', 'hit-rate', 'bundle time']}
            rows={[
              ['A (cold)', '1,442', '0', '1,442', '—', '4,973 ms'],
              ['B', '1,442', '1,440', '2', '99.9%', '1,710 ms'],
              ['C', '1,442', '1,440', '2', '99.9%', '1,799 ms'],
            ]}
          />

          <Callout>
            <strong>Takeaway.</strong> Same dependencies ⇒ one shared transform cache. The first project on a machine
            pays the cold cost once; every same-dep project after it reuses ~99.9% of the work.
          </Callout>

          {/* ── CASE 2 ────────────────────────────────────────────────────── */}
          <H id="case-2">Case 2 · Installing a new package</H>
          <P>
            Same setup — three identical apps, shared cache built cold by <code>proj-a</code> — but now{' '}
            <code>proj-b</code> installs and imports one unique package (<code>ms</code>) and <code>proj-c</code> a
            different one (<code>dayjs</code>). The question: does adding a package rebuild the transform cache of{' '}
            <code>node_modules</code> from scratch, or only for that package?
          </P>

          <HitMissBars
            caption="After installing one unique package — what re-transforms"
            rows={[
              { name: 'proj-a', sub: 'default expo · cold', total: 1442, hits: 0 },
              { name: 'proj-b', sub: '+ ms', total: 1443, hits: 1440, self: true },
              { name: 'proj-c', sub: '+ dayjs', total: 1443, hits: 1440, self: true },
            ]}
            footnote={
              <>
                proj-b/proj-c re-transform only <strong>3 of 1,443 modules</strong> (0.2%): the new package
                (<code>node_modules/ms/index.js</code>), the one screen edited to import it, and expo-router&rsquo;s
                generated route module (which re-hashes because app source changed). No other <code>node_modules</code>
                module runs.
              </>
            }
          />

          <Table
            head={['project', 'unique pkg', 'modules', 'hits', 'misses', 'hit-rate', 'bundle time']}
            rows={[
              ['proj-a', '—', '1,442', '0', '1,442', '— (cold)', '3,122 ms'],
              ['proj-b', 'ms', '1,443', '1,440', '3', '99.8%', '1,333 ms'],
              ['proj-c', 'dayjs', '1,443', '1,440', '3', '99.8%', '1,114 ms'],
            ]}
          />

          <Callout>
            <strong>Takeaway.</strong> Installing a package does <em>not</em> rebuild <code>node_modules</code>. The
            cache is keyed per module by source bytes, so only the new package (plus the app file that imports it) is a
            miss — the other ~1,440 modules are reused untouched.
          </Callout>

          {/* ── CASE 2 memory ─────────────────────────────────────────────── */}
          <H id="case-2-memory">Case 2 · Thin serve vs Metro memory</H>
          <P>
            The same three projects, two serving paths. <strong className="text-foreground">Metro</strong> (
            <code>expo start</code>) is the normal dev server: it transforms and assembles the graph on every bundle
            request. <strong className="text-foreground">jetplane thin serve</strong> builds the bundle image once, then
            replays it mmap&rsquo;d from a no-Metro process — so no transform happens at serve time.
          </P>

          <MemoryChart
            caption="Dev-server memory (MB · lower is better) — Metro vs thin serve"
            domain={900}
            rows={[
              { name: 'proj-a · Metro', sub: 'expo start', idle: 654, peak: 2965 },
              { name: 'proj-a · thin', sub: 'jetplane serve', self: true, idle: 139, peak: 156 },
              { name: 'proj-b · Metro', sub: '+ ms', idle: 658, peak: 1612 },
              { name: 'proj-b · thin', sub: '+ ms', self: true, idle: 140, peak: 156 },
              { name: 'proj-c · Metro', sub: '+ dayjs', idle: 657, peak: 1561 },
              { name: 'proj-c · thin', sub: '+ dayjs', self: true, idle: 140, peak: 156 },
            ]}
            footnote={
              <>
                Linear scale to 900&nbsp;MB; Metro&rsquo;s peaks run off the axis (torn end) with their true value. thin
                serve in colour, Metro muted. thin peak is steady-state serving — the one-time image build is excluded
                (see caveats).
              </>
            }
          />

          <Table
            head={['project', 'Metro idle', 'Metro peak', 'thin idle', 'thin peak', 'thin (bun only)']}
            rows={[
              ['proj-a', '654 MB', '2,965 MB', '139 MB', '156 MB', '108 MB'],
              ['proj-b', '658 MB', '1,612 MB', '140 MB', '156 MB', '108 MB'],
              ['proj-c', '657 MB', '1,561 MB', '140 MB', '156 MB', '108 MB'],
            ]}
          />

          <Callout>
            <strong>Takeaway.</strong> thin serve is <strong>flat at ~140&nbsp;MB idle / 156&nbsp;MB peak</strong>{' '}
            regardless of the project or the new package, because it serves a pre-built bundle. Metro holds ~655&nbsp;MB
            idle and spikes to 1.5–3&nbsp;GB on a cold bundle. Idle is ~4.7× lighter; peak is ~10× (warm) to ~19× (cold)
            lighter. The ~140&nbsp;MB tree is a ~30&nbsp;MB Node launcher plus the ~108&nbsp;MB bun server.
          </Callout>

          {/* ── CAVEATS ───────────────────────────────────────────────────── */}
          <H id="caveats">Caveats &amp; honest framing</H>
          <P>These are different roles, so read the numbers with the following in mind:</P>
          <ul className="mt-4 space-y-3 text-muted-foreground">
            <li className="leading-relaxed">
              <strong className="text-foreground">The thin peak is steady-state serving.</strong> On a new package the
              lockfile + app source change, so the next <code>jetplane serve</code> rebuilds the bundle image once — a
              Metro build with a transient peak in the proj-b/proj-c range (~1.6&nbsp;GB, ~1.3&nbsp;s, riding the
              incremental cache) — then settles back to ~108&nbsp;MB. thin serve trades a one-time rebuild for a
              permanently low steady state.
            </li>
            <li className="leading-relaxed">
              <strong className="text-foreground">Bumping the transformer invalidates everything.</strong> The
              incremental win in Case&nbsp;2 holds for a normal leaf dependency. If an install bumps the{' '}
              <em>upstream transformer</em> (<code>nativewind</code> / <code>react-native-css-interop</code> /{' '}
              <code>@expo/metro-config</code>) or the Metro/Babel toolchain, the cache key changes and everything
              re-transforms — by design, since a different transformer can produce different output.
            </li>
            <li className="leading-relaxed">
              <strong className="text-foreground">Absolute numbers are machine-dependent.</strong> These were captured
              under load on one machine; expect different absolutes elsewhere. The <em>ratios</em> (and the flat-vs-spiky
              shape) are the point.
            </li>
          </ul>

          {/* ── REPRODUCE ─────────────────────────────────────────────────── */}
          <H id="reproduce">Reproduce</H>
          <P>
            Case&nbsp;1 is a committed harness — three SDK-54 apps under <code>bench/</code>, built cold→warm with
            hit-rate read from the worker telemetry:
          </P>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card/40 p-4 text-sm">
            <code>node bench/xproject-hitrate.mjs</code>
          </pre>
          <P>
            Case&nbsp;2 clones one app three times (APFS copy-on-write), installs one unique package into two of them,
            and measures both the Metro and thin-serve paths. Full method and harnesses are in{' '}
            <a className="text-brand hover:text-brand-hover" href="https://github.com/sanketsahu/jetplane/tree/main/bench">
              bench/
            </a>{' '}
            — and the underlying mechanism is described in the{' '}
            <Link className="text-brand hover:text-brand-hover" href="/docs">
              docs
            </Link>
            .
          </P>
        </article>
      </div>
      <SiteFooter />
    </>
  )
}
