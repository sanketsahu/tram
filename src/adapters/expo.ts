// Expo adapter (Path 2). Orchestrates the end-to-end `tram dev` for Expo:
//   1. ensure the shared transform service is running (singleton, shared across projects)
//   2. ensure a pre-built vendor image exists for this lockHash (build once via service)
//   3. start the thin per-project server (mmap vendor + delegate app transforms)
//
// The thin server never loads babel, so it stays ~55 MB. babel lives once in the service.

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TRAM_HOME, lockHash, ensureDir } from '../core.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVICE = path.join(HERE, '..', 'transform-service.mjs')
const SERVICE_PORT = 8199
const PLACEHOLDER = '\0TRAM_ROOT\0'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function serviceHealthy(): Promise<boolean> {
  try { const r = await fetch(`http://localhost:${SERVICE_PORT}/health`); return r.ok } catch { return false }
}

// Singleton shared service: start detached so it outlives this CLI and is reused by
// every other `tram dev` on the box.
async function ensureService(toolchainProject: string, log: (s: string) => void) {
  if (await serviceHealthy()) { log(`tram: transform service already running :${SERVICE_PORT} (shared)`) ; return }
  log(`tram: starting shared transform service (babel, once) :${SERVICE_PORT}...`)
  const child = spawn('node', [SERVICE, toolchainProject, String(SERVICE_PORT)], {
    detached: true, stdio: 'ignore', env: process.env,
  })
  child.unref()
  const dl = Date.now() + 30000
  while (Date.now() < dl) { if (await serviceHealthy()) { log('tram: transform service ready'); return } await sleep(150) }
  throw new Error('transform service did not become healthy')
}

// The reachable-heavy vendor set for an Expo app (worst case: worklet path-bakers).
function vendorFiles(projectDir: string): string[] {
  const roots = [
    'node_modules/react-native-reanimated/src',
    'node_modules/react-native-worklets/src',
    'node_modules/expo-router/build',
  ].map((r) => path.join(projectDir, r))
  const out: string[] = []
  const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p) } }
  roots.forEach(walk)
  return out
}

function vendorImagePath(lh: string): string {
  return path.join(ensureDir(path.join(TRAM_HOME, 'images')), `${lh}-ios.pack`)
}

async function transformRaw(file: string, projectDir: string): Promise<string> {
  const r = await fetch(`http://localhost:${SERVICE_PORT}/transform`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, root: projectDir, platform: 'ios', raw: true }),
  })
  const j = await r.json() as any
  return j.error ? `/* ${j.error} */` : j.code
}

// Build the pre-built, path-normalized, content-addressed vendor image (once per lockHash).
async function ensureVendorImage(projectDir: string, lh: string, log: (s: string) => void): Promise<string> {
  const img = vendorImagePath(lh)
  if (fs.existsSync(img)) { log(`tram: vendor image WARM ${path.relative(TRAM_HOME, img)}`); return img }
  const files = vendorFiles(projectDir)
  log(`tram: building vendor image (${files.length} modules, via shared service, once)...`)
  const t0 = performance.now()
  const parts: string[] = []
  // limited concurrency to the service
  const CONC = 16
  for (let i = 0; i < files.length; i += CONC) {
    const chunk = files.slice(i, i + CONC)
    const codes = await Promise.all(chunk.map((f) => transformRaw(f, projectDir)))
    parts.push(...codes)
  }
  fs.writeFileSync(img, parts.join('\n'))
  log(`tram: vendor image built in ${Math.round(performance.now() - t0)} ms -> ${path.relative(TRAM_HOME, img)} (${(fs.statSync(img).size / 1048576).toFixed(1)} MB)`)
  return img
}

function appFiles(projectDir: string): string[] {
  const dir = path.join(projectDir, 'src')
  const out: string[] = []
  const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p) } }
  walk(dir)
  return out
}

async function transformApp(file: string, projectDir: string): Promise<string> {
  const r = await fetch(`http://localhost:${SERVICE_PORT}/transform`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, root: projectDir, platform: 'ios' }),
  })
  const j = await r.json() as any
  return j.error ? `/* ${j.error} */` : j.code
}

const rssMB = () => (process.memoryUsage().rss / 1048576).toFixed(1)

export async function runExpoDev(projectDir: string, port: number, log: (s: string) => void) {
  const lh = lockHash(projectDir)
  log(`tram: expo project, lockHash=${lh}`)
  await ensureService(projectDir, log)
  const img = await ensureVendorImage(projectDir, lh, log)

  // thin server: mmap the vendor image (shared physical memory), delegate app transforms
  const vendorMapped = (globalThis as any).Bun.mmap(img) as Uint8Array
  const decoder = new TextDecoder()

  async function assembleBundle(): Promise<string> {
    const vendor = decoder.decode(vendorMapped).split(PLACEHOLDER).join(projectDir)
    const files = appFiles(projectDir)
    const app = (await Promise.all(files.map(async (f) => `// app: ${path.relative(projectDir, f)}\n` + (await transformApp(f, projectDir))))).join('\n')
    return vendor + '\n// ---- app layer ----\n' + app
  }

  ;(globalThis as any).Bun.serve({
    port,
    async fetch(req: Request) {
      const url = new URL(req.url)
      if (url.pathname === '/status') return new Response('packager-status:running')
      if (url.pathname.endsWith('.bundle')) {
        const t0 = performance.now()
        const body = await assembleBundle()
        return new Response(body, { headers: { 'content-type': 'application/javascript', 'x-tram-assemble-ms': (performance.now() - t0).toFixed(1), 'x-tram-rss-mb': rssMB() } })
      }
      return new Response('tram thin server', { status: 200 })
    },
  })
  log(`tram: dev server ready :${port}  vendor=${(vendorMapped.length / 1048576).toFixed(1)}MB mmap'd  thinRSS=${rssMB()}MB (no babel)`)
  log(`tram: bundle at http://localhost:${port}/index.bundle?platform=ios`)
}
