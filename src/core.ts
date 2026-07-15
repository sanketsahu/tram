// Tram core: hashing, system paths, lockfile hashing, framework detection,
// install backend selection, and the content-addressed store.
//
// No daemon, no process management. Everything shared lives on disk under ~/.tram,
// so any number of independent `tram` runs reuse the same cache.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

export const TRAM_HOME = process.env.TRAM_HOME || path.join(os.homedir(), '.tram')
export const TOOLCHAIN = 'tram@0.1.0'

export const sha256 = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex')

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true })
  return p
}

// ---- lockfile hash (H2 manifest key) ------------------------------------
// Represents the dependency set. Two projects with the same deps -> same hash
// -> they share the vendor cache. This is the whole cross-project sharing key.

const LOCKFILES = ['bun.lock', 'bun.lockb', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']

export function lockHash(projectDir: string): string {
  for (const name of LOCKFILES) {
    const p = path.join(projectDir, name)
    if (fs.existsSync(p)) return sha256(fs.readFileSync(p)).slice(0, 16)
  }
  // fallback: hash the declared dependency set
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const sorted = Object.keys(deps).sort().map((k) => `${k}@${deps[k]}`).join('\n')
    return sha256(sorted).slice(0, 16)
  } catch {
    return sha256(projectDir).slice(0, 16)
  }
}

// ---- framework detection ------------------------------------------------

export type Framework = 'vite' | 'expo' | 'next' | 'unknown'

export function detectFramework(projectDir: string): Framework {
  let pkg: any = {}
  try { pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')) } catch {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  if (deps.expo || deps['react-native']) return 'expo'
  if (deps.next) return 'next'
  if (deps.vite) return 'vite'
  const has = (f: string) => fs.existsSync(path.join(projectDir, f))
  if (has('vite.config.ts') || has('vite.config.js') || has('vite.config.mjs')) return 'vite'
  if (has('app.json') || has('app.config.js')) return 'expo'
  return 'unknown'
}

// ---- install backend selection ------------------------------------------

const has = (cmd: string): boolean => {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true } catch { return false }
}

export function pickInstaller(): { cmd: string; args: string[] } | null {
  if (has('bun')) return { cmd: 'bun', args: ['install'] }
  if (has('pnpm')) return { cmd: 'pnpm', args: ['install'] }
  if (has('npm')) return { cmd: 'npm', args: ['install'] }
  return null
}

export function ensureInstalled(projectDir: string, log: (s: string) => void): void {
  if (fs.existsSync(path.join(projectDir, 'node_modules'))) return
  const inst = pickInstaller()
  if (!inst) { log('tram: no installer found (bun/pnpm/npm); skipping'); return }
  log(`tram: installing deps with ${inst.cmd} (into shared store where supported)...`)
  execSync([inst.cmd, ...inst.args].join(' '), { cwd: projectDir, stdio: 'inherit' })
}

// ---- content-addressed store (H1) ---------------------------------------

const storeDir = () => ensureDir(path.join(TRAM_HOME, 'store'))

export function storeGet(key: string): Buffer | null {
  const p = path.join(storeDir(), key.slice(0, 2), key)
  return fs.existsSync(p) ? fs.readFileSync(p) : null
}

export function storePut(key: string, data: string | Buffer): void {
  const dir = ensureDir(path.join(storeDir(), key.slice(0, 2)))
  const p = path.join(dir, key)
  if (!fs.existsSync(p)) fs.writeFileSync(p, data)
}

export const viteCacheDir = (lh: string): string =>
  path.join(TRAM_HOME, 'vite', lh)
