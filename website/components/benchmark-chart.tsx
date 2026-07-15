'use client'
/**
 * Benchmark chart — horizontal grouped bars, two series per dev server: idle
 * memory and peak memory (Metro's cold bundle / others under first load). Both
 * series are megabytes on one LINEAR axis (same unit, not dual-axis), so the
 * lengths are real and comparable by eye.
 *
 * tram is featured in colour; Metro (and the web dev servers behind the toggle)
 * are muted to grey for context. Idle is the upper bar of each pair, peak the
 * lower — so the two series stay legible on muted rows by position.
 *
 * Metro's cold bundle (~2,018 MB) runs an order of magnitude past the
 * single-process servers; on a linear axis it would flatten everything else, so
 * its bar is drawn CLIPPED (torn end) with its true number.
 *
 * Series colours are CVD-validated on both light and dark surfaces (blue #3b82f6
 * ↔ amber #d97706, ΔE ~38 normal / ~28 tritan) with position + labels as
 * secondary encoding.
 */
import { useState } from 'react'

const IDLE = '#3b82f6' // blue — idle memory (tram)
const PEAK = '#d97706' // amber — peak memory (tram)
const IDLE_MUTED = '#6b7280' // grey — idle (others)
const PEAK_MUTED = '#4b5563' // darker grey — peak (others)

type Row = {
  name: string
  sub: string
  self?: boolean
  web?: boolean
  idle: number
  peak: number
  note: string
}

const DATA: Row[] = [
  { name: 'tram', sub: 'thin serve · no Metro', self: true, idle: 40, peak: 68, note: 'mmap’d pre-built bundle served from a thin process; no per-project Metro' },
  { name: 'Metro (Expo)', sub: 'React Native · per project', idle: 325, peak: 2018, note: 'idle ~325 MB; cold bundle transiently spikes to ~2 GB and holds a ~700 MB floor' },
  { name: 'Vite', sub: 'web dev server', web: true, idle: 255, peak: 255, note: 'lazy on-demand ESM; no monolithic bundle, so no spike' },
  { name: 'Next.js', sub: 'Turbopack · web', web: true, idle: 851, peak: 853, note: 'route compiled on demand via Turbopack (Rust + Node)' },
]

// Linear axis sized to the single-process servers; Metro's cold bundle is clipped.
// MAXW < 100 reserves room for the value label (and torn end) after each bar.
const DOMAIN = 900
const MAXW = 84
const widthPct = (mb: number) => (Math.min(mb, DOMAIN) / DOMAIN) * MAXW

const SERIES = [
  { key: 'idle' as const, label: 'Idle', color: IDLE },
  { key: 'peak' as const, label: 'Peak (under load)', color: PEAK },
]
const barColor = (self: boolean | undefined, key: 'idle' | 'peak') =>
  self ? (key === 'idle' ? IDLE : PEAK) : key === 'idle' ? IDLE_MUTED : PEAK_MUTED

export function BenchmarkChart() {
  const [hover, setHover] = useState<{ name: string; key: 'idle' | 'peak' } | null>(null)
  const [showWeb, setShowWeb] = useState(false)
  const rows = showWeb ? DATA : DATA.filter((d) => !d.web)

  return (
    <figure
      aria-label="Idle and peak dev-server memory in megabytes, lower is better"
      className="rounded-xl border border-border bg-card/40 p-6 sm:p-8"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm font-medium text-muted-foreground">
          Dev-server memory (MB) · lower is better
        </figcaption>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowWeb((v) => !v)}
        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-hover"
        aria-expanded={showWeb}
      >
        {showWeb ? 'Hide web dev servers' : 'Show web dev servers'}
        <span aria-hidden className={'transition-transform ' + (showWeb ? 'rotate-180' : '')}>↓</span>
      </button>

      <div className="overflow-x-auto pt-8">
        <div className="min-w-[460px] space-y-4">
          {rows.map((d) => (
            <div key={d.name} className="grid grid-cols-[8rem_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]">
              <div className="min-w-0 text-right">
                <div className={'truncate text-sm ' + (d.self ? 'font-semibold text-brand' : 'text-foreground/80')}>
                  {d.name}
                </div>
                <div className="truncate text-[11px] leading-tight text-muted-foreground">{d.sub}</div>
              </div>

              <div className="space-y-1">
                {SERIES.map((s) => {
                  const mb = d[s.key]
                  const clipped = mb > DOMAIN
                  const color = barColor(d.self, s.key)
                  const active = hover?.name === d.name && hover.key === s.key
                  const dim = hover !== null && !active
                  return (
                    <div
                      key={s.key}
                      className="relative flex h-4 items-center"
                      onMouseEnter={() => setHover({ name: d.name, key: s.key })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div
                        className="relative h-full rounded-r-[3px]"
                        style={{
                          width: `max(${widthPct(mb)}%, 4px)`,
                          background: color,
                          opacity: dim ? 0.5 : 1,
                          transition: 'opacity 120ms',
                        }}
                      >
                        {clipped && (
                          <span
                            className="absolute inset-y-0 -right-1 w-2"
                            style={{ background: `repeating-linear-gradient(45deg, ${color} 0 4px, var(--background) 4px 7px)` }}
                          />
                        )}
                      </div>
                      <span className={'ml-2 whitespace-nowrap text-xs tabular-nums ' + (d.self ? 'text-muted-foreground' : 'text-muted-foreground/80')}>
                        {mb.toLocaleString()}
                      </span>
                      {active && (
                        <div className="pointer-events-none absolute -top-8 left-0 z-10 max-w-xs whitespace-normal rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg">
                          <span className="font-semibold">{mb.toLocaleString()} MB</span>
                          <span className="text-muted-foreground"> {s.label.toLowerCase()} · {d.note}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        tram in colour; Metro and the web dev servers muted for context. Linear scale — Metro’s
        cold bundle (~2,018 MB) runs off the axis (torn end) so the single-process servers stay
        comparable. Resident memory of the whole dev-server process tree (<code>ps</code> RSS),
        Apple&nbsp;Silicon · macOS&nbsp;15 ·{' '}
        <a className="underline decoration-border underline-offset-2 hover:text-foreground" href="https://github.com/sanketsahu/tram/blob/main/bench/RESULTS.md">
          bench/RESULTS.md
        </a>
      </p>
    </figure>
  )
}
