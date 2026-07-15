#!/usr/bin/env bun
// Path-2 MEMORY FUSION: serve a PRE-BUILT (cross-project-cached) device-bootable bundle
// to Expo Go over the dev protocol, with NO per-project Metro. Bundle is mmap'd (shared
// physical pages across processes). Target RSS ~50 MB vs Metro's ~325 MB.
//
// Usage: bun src/tram-serve-thin.ts <projectDir> <port> <imageDir>

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
// @ts-ignore - sibling ESM helper
import { parseBundle, makeUpdate } from './tram-hmr.mjs'

const projectDir = process.argv[2]
const port = parseInt(process.argv[3] || '8091', 10)
const imageDir = process.argv[4] || `${process.env.HOME}/.tram/images/expo54`

function lanIP(): string {
  for (const dev of ['en0', 'en1']) {
    try { const ip = execSync(`ipconfig getifaddr ${dev}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (ip) return ip } catch {}
  }
  return 'localhost'
}

const manifestRaw = fs.readFileSync(path.join(imageDir, 'manifest.json'), 'utf8')
// Expo Go (dev) requests multipart/mixed and rejects plain JSON as a "legacy manifest".
// We replay the exact multipart response captured from Expo's own dev server.
const multipartPath = path.join(imageDir, 'manifest-multipart.bin')
const multipartRaw = fs.existsSync(multipartPath) ? fs.readFileSync(multipartPath, 'utf8') : ''
const boundary = multipartRaw ? multipartRaw.split('\r\n')[0].replace(/^--/, '') : ''
const bundlePath = path.join(imageDir, 'main.ios.bundle')
const bundle = (globalThis as any).Bun.mmap(bundlePath) as Uint8Array

// HMR: parse the bundle for path->id/deps/inverse-deps, watch app files, push updates
const maps = parseBundle(bundlePath)
const clients = new Set<any>()
const lan = lanIP()
let rev = 0
async function pushUpdate(absFile: string) {
  if (clients.size === 0) return
  try {
    const { modified, added } = await makeUpdate(projectDir, absFile, maps, `http://${lan}:${port}`)
    rev++
    const start = JSON.stringify({ type: 'update-start', body: { isInitialUpdate: false } })
    const upd = JSON.stringify({ type: 'update', body: { revisionId: String(rev), added, modified: [modified], deleted: [] } })
    const done = JSON.stringify({ type: 'update-done' })
    for (const ws of clients) { ws.send(start); ws.send(upd); ws.send(done) }
    console.log(`hmr: pushed ${path.relative(projectDir, absFile)} (module ${modified.module[0]}, +${added.length} new) to ${clients.size} client(s)`)
  } catch (e: any) {
    console.log('hmr: skip', path.relative(projectDir, absFile), '-', e.message)
  }
}
// debounced recursive watch of the app source
const watchDirs = ['app', 'components', 'src', 'constants', 'hooks'].map((d) => path.join(projectDir, d)).filter((d) => fs.existsSync(d))
let timer: any = null
const pending = new Set<string>()
for (const dir of watchDirs) {
  fs.watch(dir, { recursive: true }, (_e, file) => {
    if (!file || !/\.(tsx?|jsx?)$/.test(file)) return
    pending.add(path.join(dir, file))
    clearTimeout(timer)
    timer = setTimeout(() => { const files = [...pending]; pending.clear(); files.forEach(pushUpdate) }, 60)
  })
}

const rewriteHost = (s: string, host: string) =>
  s.split('http://127.0.0.1:8081').join(`http://${host}`).split('http://localhost:8081').join(`http://${host}`)

// expo-updates stores each loaded manifest in SQLite keyed by (scope_key, commit_time).
// Our replayed manifest is static, so re-scanning collides (UNIQUE constraint). Give
// every manifest a fresh id + createdAt so each load is a distinct update.
const freshen = (s: string): string => s
  .replace(/"id":"[^"]*"/, `"id":"${randomUUID()}"`)
  .replace(/"createdAt":"[^"]*"/, `"createdAt":"${new Date().toISOString()}"`)

const rssMB = () => (process.memoryUsage().rss / 1048576).toFixed(1)

// best-effort asset resolution from the project (images referenced by the bundle)
function serveAsset(url: URL): Response {
  try {
    let rel = url.searchParams.get('unstable_path')
    if (rel) rel = decodeURIComponent(rel)
    else rel = url.pathname.replace(/^\/assets\/?/, '')
    const abs = path.resolve(projectDir, rel || '')
    if (abs.startsWith(projectDir) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return new Response(fs.readFileSync(abs))
    }
  } catch {}
  return new Response('asset not found', { status: 404 })
}

;(globalThis as any).Bun.serve({
  port,
  hostname: '0.0.0.0', // reachable from a phone on the LAN
  fetch(req: Request, server: any) {
    const url = new URL(req.url)
    const host = req.headers.get('host') || `localhost:${port}`

    if (url.pathname === '/hot') { if (server.upgrade(req)) return undefined as any }
    if (url.pathname === '/status') return new Response('packager-status:running')

    if (url.pathname.endsWith('.bundle')) {
      return new Response(bundle, { headers: { 'content-type': 'application/javascript', 'x-tram-rss-mb': rssMB() } })
    }

    if (url.pathname.startsWith('/assets')) return serveAsset(url)

    // manifest: rewrite the captured host to whatever the client reached us on, so the
    // bundle + asset URLs point back here (works for simulator localhost and LAN phone)
    const accept = req.headers.get('accept') || ''
    if (accept.includes('multipart/mixed') && multipartRaw) {
      return new Response(rewriteHost(freshen(multipartRaw), host), {
        headers: {
          'content-type': `multipart/mixed; boundary=${boundary}`,
          'expo-protocol-version': '0',
          'expo-sfv-version': '0',
          'cache-control': 'private, max-age=0',
        },
      })
    }
    return new Response(rewriteHost(freshen(manifestRaw), host), { headers: { 'content-type': 'application/expo+json', 'cache-control': 'private, max-age=0' } })
  },
  websocket: {
    open(ws: any) { clients.add(ws) },
    close(ws: any) { clients.delete(ws) },
    message(ws: any, msg: any) {
      let data: any = {}
      try { data = JSON.parse(String(msg)) } catch { return }
      if (data.type === 'register-entrypoints') ws.send(JSON.stringify({ type: 'bundle-registered' }))
    },
  },
})

console.log(`tram-serve-thin: :${port}  bundle=${(bundle.length / 1048576).toFixed(1)}MB mmap'd  idleRSS=${rssMB()}MB (no Metro)`)

const ip = lanIP()
const expUrl = `exp://${ip}:${port}`
try {
  const require = createRequire(projectDir + '/')
  const qrcode = require('qrcode-terminal')
  console.log('\nScan with Expo Go:')
  qrcode.generate(expUrl, { small: true }, (qr: string) => console.log(qr))
} catch (e) {
  console.log('\n(install qrcode-terminal for a QR)')
}
console.log(`  Phone (same Wi-Fi):  ${expUrl}`)
console.log(`  Simulator:           exp://localhost:${port}`)
