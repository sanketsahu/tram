/**
 * Static (server-rendered) benchmark charts for the /benchmarks page. Horizontal
 * bars, values always labelled, theme-aware via CSS vars on the surface and fixed
 * CVD-safe hues on the bars (blue #3b82f6 ↔ amber #d97706, grey for context).
 */

const BLUE = '#3b82f6' // hits · idle · jetplane
const AMBER = '#d97706' // misses · peak
const GREY = '#6b7280' // idle (context / Metro)
const GREY_D = '#4b5563' // peak (context / Metro)

function Figure({ caption, legend, children, footnote }: {
  caption: string
  legend?: { label: string; color: string }[]
  children: React.ReactNode
  footnote?: React.ReactNode
}) {
  return (
    <figure className="mt-6 rounded-xl border border-border bg-card/40 p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm font-medium text-muted-foreground">{caption}</figcaption>
        {legend && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[440px]">{children}</div>
      </div>
      {footnote && <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{footnote}</p>}
    </figure>
  )
}

/* ── hits vs misses, one stacked bar per project ────────────────────────────── */
export type CacheRow = { name: string; sub: string; total: number; hits: number; self?: boolean }

export function HitMissBars({ caption, rows, footnote }: { caption: string; rows: CacheRow[]; footnote?: React.ReactNode }) {
  return (
    <Figure caption={caption} legend={[{ label: 'cache hit', color: BLUE }, { label: 'miss (transformed)', color: AMBER }]} footnote={footnote}>
      <div className="space-y-4">
        {rows.map((r) => {
          const miss = r.total - r.hits
          const hitPct = r.total ? (r.hits / r.total) * 100 : 0
          return (
            <div key={r.name} className="grid grid-cols-[9rem_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
              <div className="min-w-0 text-right">
                <div className={'truncate text-sm ' + (r.self ? 'font-semibold text-brand' : 'text-foreground/80')}>{r.name}</div>
                <div className="truncate text-[11px] leading-tight text-muted-foreground">{r.sub}</div>
              </div>
              <div>
                <div className="flex h-5 w-full overflow-hidden rounded-[3px]" style={{ background: 'var(--border)' }}>
                  {r.hits > 0 && <div style={{ width: `${hitPct}%`, background: BLUE }} />}
                  {miss > 0 && <div style={{ width: `max(${100 - hitPct}%, 3px)`, background: AMBER }} />}
                </div>
                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {r.hits.toLocaleString()} hits · <span style={{ color: AMBER }}>{miss.toLocaleString()} miss</span>
                  {' · '}
                  {r.total ? (r.hits ? `${hitPct.toFixed(1)}% reused` : 'cold — builds the cache') : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Figure>
  )
}

/* ── idle + peak memory, grouped horizontal bars ────────────────────────────── */
export type MemRow = { name: string; sub: string; self?: boolean; idle: number; peak: number }

export function MemoryChart({ caption, rows, domain = 900, footnote }: { caption: string; rows: MemRow[]; domain?: number; footnote?: React.ReactNode }) {
  const MAXW = 84
  const w = (mb: number) => (Math.min(mb, domain) / domain) * MAXW
  const series = [
    { key: 'idle' as const, label: 'Idle', on: BLUE, off: GREY },
    { key: 'peak' as const, label: 'Peak', on: AMBER, off: GREY_D },
  ]
  return (
    <Figure
      caption={caption}
      legend={[{ label: 'Idle', color: BLUE }, { label: 'Peak', color: AMBER }]}
      footnote={footnote}
    >
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[9rem_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="min-w-0 text-right">
              <div className={'truncate text-sm ' + (r.self ? 'font-semibold text-brand' : 'text-foreground/80')}>{r.name}</div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground">{r.sub}</div>
            </div>
            <div className="space-y-1">
              {series.map((s) => {
                const mb = r[s.key]
                const clipped = mb > domain
                const color = r.self ? s.on : s.off
                return (
                  <div key={s.key} className="relative flex h-4 items-center">
                    <div className="relative h-full rounded-r-[3px]" style={{ width: `max(${w(mb)}%, 4px)`, background: color }}>
                      {clipped && (
                        <span
                          className="absolute inset-y-0 -right-1 w-2"
                          style={{ background: `repeating-linear-gradient(45deg, ${color} 0 4px, var(--background) 4px 7px)` }}
                        />
                      )}
                    </div>
                    <span className="ml-2 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {mb.toLocaleString()}{clipped ? '' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Figure>
  )
}

/* ── single-series horizontal bars (e.g. bundle time) ───────────────────────── */
export type BarRow = { name: string; sub: string; self?: boolean; value: number }

export function Bars({ caption, rows, unit, footnote }: { caption: string; rows: BarRow[]; unit: string; footnote?: React.ReactNode }) {
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <Figure caption={caption} footnote={footnote}>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[9rem_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="min-w-0 text-right">
              <div className={'truncate text-sm ' + (r.self ? 'font-semibold text-brand' : 'text-foreground/80')}>{r.name}</div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground">{r.sub}</div>
            </div>
            <div className="flex h-4 items-center">
              <div className="h-full rounded-r-[3px]" style={{ width: `max(${(r.value / max) * 88}%, 4px)`, background: r.self ? BLUE : GREY }} />
              <span className="ml-2 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {r.value.toLocaleString()} {unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Figure>
  )
}
