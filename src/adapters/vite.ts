// Vite adapter.
//
// Strategy: let Vite own the small mutable app layer (its strength: HMR, on-demand
// src transform). Externalize the expensive, immutable part — the optimized vendor
// prebundle — into a SHARED, content-addressed cache keyed by the lockfile hash.
//
// Vite already prebundles deps into `cacheDir` (default node_modules/.vite). By
// pointing cacheDir at ~/.jetplane/vite/<lockHash>, every project/run with the same deps
// reuses one prebundle: warm boot, deduped disk, and (because independent processes
// read the same files) shared OS page cache.
//
// The adapter is a plain Vite plugin, so it also works dropped into a user's
// vite.config.ts without the `jetplane` runner.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { lockHash, viteCacheDir, ensureDir } from '../core.ts'

export interface TramViteOptions {
  projectDir?: string
  log?: (s: string) => void
}

export function tramVite(opts: TramViteOptions = {}) {
  const log = opts.log || (() => {})
  let shared = ''
  let warm = false

  return {
    name: 'jetplane',
    enforce: 'pre' as const,

    config(_userConfig: any, _env: any) {
      const projectDir = opts.projectDir || process.cwd()
      const lh = lockHash(projectDir)
      shared = ensureDir(viteCacheDir(lh))
      // "_metadata.json" is Vite's marker that a valid prebundle already exists.
      warm = fs.existsSync(path.join(shared, 'deps', '_metadata.json'))
      log(`jetplane: lockHash=${lh}`)
      log(`jetplane: vendor cache ${warm ? 'WARM (reuse shared prebundle)' : 'COLD (build shared prebundle)'} -> ${shared}`)
      return {
        cacheDir: shared,
        // keep the prebundle stable/shareable across identical-dep projects
        optimizeDeps: { holdUntilCrawlEnd: true },
      }
    },

    configResolved(resolved: any) {
      log(`jetplane: cacheDir resolved to ${resolved.cacheDir}`)
    },
  }
}

// Start a real Vite dev server for `projectDir` with the jetplane plugin injected,
// using the PROJECT's own installed Vite (resolved dynamically).
export async function runViteDev(
  projectDir: string,
  port: number,
  log: (s: string) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const vitePkgPath = path.join(projectDir, 'node_modules', 'vite')
  if (!fs.existsSync(vitePkgPath)) throw new Error(`vite not found in ${projectDir}`)
  const pkg = JSON.parse(fs.readFileSync(path.join(vitePkgPath, 'package.json'), 'utf8'))
  const entryRel = (pkg.exports?.['.']?.import?.default) || pkg.module || pkg.main || 'dist/node/index.js'
  const entry = path.join(vitePkgPath, entryRel)
  const vite: any = await import(pathToFileURL(entry).href)

  const server = await vite.createServer({
    root: projectDir,
    configFile: undefined, // let Vite discover the project's config
    plugins: [tramVite({ projectDir, log })],
    server: { port, strictPort: true },
    clearScreen: false,
  })
  await server.listen()
  const url = `http://localhost:${port}/`
  return { url, close: () => server.close() }
}
