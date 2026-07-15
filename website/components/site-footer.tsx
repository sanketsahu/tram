import Link from 'next/link'
import { Logo } from '@/components/logo'

const RELATED = [
  { name: 'Lifo', desc: 'Linux APIs in the browser', href: 'https://lifo.sh' },
  { name: 'tinbase', desc: 'Supabase-compatible backend, no Docker', href: 'https://tinbase.dev' },
  { name: 'RapidNative', desc: 'Expo apps, full-stack in the browser', href: 'https://rapidnative.com' },
]

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Related projects
          </span>
          {RELATED.map((p) => (
            <a key={p.name} href={p.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              <span className="font-medium text-foreground">{p.name}</span> — {p.desc}
            </a>
          ))}
        </div>

        <div className="flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span className="flex items-center gap-2">
            <Logo size={18} className="rounded-md" />
            Core by{' '}
            <a href="https://x.com/sanketsahu" className="font-medium text-foreground hover:text-brand">
              Sanket Sahu (@sanketsahu)
            </a>{' '}
            · MIT
          </span>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <a href="https://www.npmjs.com/package/jetplane" className="hover:text-foreground">npm</a>
            <a href="https://x.com/sanketsahu" aria-label="Sanket Sahu on X" className="hover:text-foreground"><XIcon /></a>
            <a href="https://github.com/sanketsahu/jetplane" aria-label="jetplane on GitHub" className="flex items-center hover:text-foreground"><GitHubIcon /></a>
          </div>
        </div>
      </div>
    </footer>
  )
}
