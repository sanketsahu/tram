import { Check, Minus, X } from 'lucide-react'

// jetplane is NOT a wholesale replacement for the Expo CLI or Metro. It has two modes:
//   - cache plugin: one line in metro.config.js, fully drop-in with `expo start`
//   - thin serve:   replaces the dev-server role for pre-built bundles (experimental)
// This matrix states exactly what each mode does vs stock Metro / expo start.

type Cell = { v: 'yes' | 'no' | 'partial'; note?: string } | { text: string }
const yes = (note?: string): Cell => ({ v: 'yes', note })
const no = (note?: string): Cell => ({ v: 'no', note })
const partial = (note?: string): Cell => ({ v: 'partial', note })
const t = (text: string): Cell => ({ text })

const COLS = ['Metro · expo start', 'jetplane cache plugin', 'jetplane thin serve']

const ROWS: { label: string; cells: Cell[] }[] = [
  { label: 'Drop-in with the Expo CLI (expo start)', cells: [yes('it is Metro'), yes('+1 line in metro.config.js'), no('separate serve command')] },
  { label: 'Runs in Expo Go', cells: [yes(), yes(), yes()] },
  { label: 'Cross-project transform cache', cells: [no("Metro's keys are root-dependent"), yes(), yes()] },
  { label: 'Cold-bundle ~2 GB spike', cells: [t('yes'), t('avoided after 1st build'), t('none')] },
  { label: 'Per dev-server memory', cells: [t('~325 MB idle · ~2 GB cold'), t('~325 MB (rides Metro)'), t('~40 MB')] },
  { label: 'HMR / Fast Refresh', cells: [yes(), yes(), yes('app-layer')] },
  { label: 'Full on-demand bundling (any entry, symbolication)', cells: [yes(), yes(), partial('pre-built bundle + app-layer HMR')] },
  { label: 'Replaces Metro', cells: [t('—'), no('augments Metro'), partial('serve role only')] },
  { label: 'Setup', cells: [t('none'), t('1 line'), t('build step + serve')] },
]

function Mark({ cell }: { cell: Cell }) {
  if ('text' in cell) return <span className="text-sm text-foreground/90">{cell.text}</span>
  const Icon = cell.v === 'yes' ? Check : cell.v === 'no' ? X : Minus
  const color = cell.v === 'yes' ? 'text-brand' : cell.v === 'no' ? 'text-muted-foreground/60' : 'text-warn'
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={`size-4 shrink-0 ${color}`} aria-hidden />
      {cell.note && <span className="text-xs leading-tight text-muted-foreground">{cell.note}</span>}
    </span>
  )
}

export function Comparison() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-card/40">
            <th className="p-4 text-sm font-medium text-muted-foreground">Capability</th>
            {COLS.map((c, i) => (
              <th key={c} className={`p-4 text-sm font-semibold ${i === 0 ? 'text-foreground/80' : 'text-brand'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-border/60 last:border-0">
              <td className="p-4 align-top text-sm text-foreground/90">{row.label}</td>
              {row.cells.map((cell, i) => (
                <td key={i} className="p-4 align-top"><Mark cell={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
