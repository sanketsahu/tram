#!/usr/bin/env bun
// Path-2 thin per-project dev server (Bun) — NO in-process babel.
//
// - mmaps the PRE-BUILT vendor image (shared physical pages across processes)
// - delegates app-layer transforms to the SHARED transform service (babel amortized once)
// - assembles + serves a bundle over Metro-compatible endpoints
//
// Because babel is not loaded here, this process stays ~55 MB regardless of N projects.
//
// Usage: bun src/serve-expo.ts <projectDir> <port> <vendorImagePath> <servicePort>

import path from 'node:path'
import fs from 'node:fs'

const projectDir = process.argv[2]
const port = parseInt(process.argv[3] || '8091', 10)
const vendorImagePath = process.argv[4]
const servicePort = parseInt(process.argv[5] || '8199', 10)
const PLACEHOLDER = '\0TRAM_ROOT\0'

// mmap the pre-built vendor image (read-only, shared physical memory)
const vendorMapped = Bun.mmap(vendorImagePath)
const decoder = new TextDecoder()

function appFiles(): string[] {
  const dir = path.join(projectDir, 'src')
  const out: string[] = []
  const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p) } }
  walk(dir)
  return out
}

async function transformApp(absFile: string): Promise<string> {
  const r = await fetch(`http://localhost:${servicePort}/transform`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file: absFile, root: projectDir, platform: 'ios' }),
  })
  const j = await r.json()
  if (j.error) return `/* transform error for ${absFile}: ${j.error} */`
  return j.code
}

async function assembleBundle(): Promise<string> {
  const vendor = decoder.decode(vendorMapped).split(PLACEHOLDER).join(projectDir)
  const files = appFiles()
  const app = (await Promise.all(files.map(async (f) =>
    `// app: ${path.relative(projectDir, f)}\n` + (await transformApp(f))
  ))).join('\n')
  return vendor + '\n// ---- app layer ----\n' + app
}

const rssMB = () => (process.memoryUsage().rss / 1048576).toFixed(1)

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/status') return new Response('packager-status:running')
    if (url.pathname.endsWith('.bundle') || url.pathname === '/index.bundle') {
      const t0 = performance.now()
      const body = await assembleBundle()
      const ms = (performance.now() - t0).toFixed(1)
      return new Response(body, { headers: { 'content-type': 'application/javascript', 'x-jetplane-assemble-ms': ms, 'x-jetplane-rss-mb': rssMB() } })
    }
    return new Response('jetplane thin server', { status: 200 })
  },
})

console.log(`jetplane-serve: ready on :${port}  vendorImage=${(vendorMapped.length / 1048576).toFixed(1)}MB  idleRSS=${rssMB()}MB (no babel)`)
