#!/usr/bin/env node
// Cross-project transform-cache hit-rate benchmark (the README "3 SDK-54 projects" table).
//
// Three real Expo SDK-54 apps with IDENTICAL deps, each wired the way `jetplane init` writes
// metro.config (jetplane transformer chained over Expo's default upstream — see each app's
// metro.config.js). Starts from an empty shared cache and builds A, then B, then C via real
// Metro. A is cold (populates the content-addressed store); B and C should hit the SAME
// entries A produced, because the cache key is root-independent.
//
// This is the exact path that regressed once (the upstream transformer's ABSOLUTE path leaked
// into the key, so same-dep projects no longer shared) — so this harness doubles as a guard:
// if the key stops being root-independent, B/C hit-rate collapses toward 0.
//
// Non-destructive: the caller's ~/.jetplane/tstore + stats.log are moved aside and restored.
//
// Usage: node bench/xproject-hitrate.mjs

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = os.homedir()
const JP = path.join(HOME, '.jetplane')
const STORE = path.join(JP, 'tstore')
const STATS = path.join(JP, 'stats.log')
const BENCH = path.dirname(fileURLToPath(import.meta.url))

const APPS = [
  { label: 'A (cold — builds cache)', dir: 'expo-app-54', port: 8121 },
  { label: 'B', dir: 'expo-app-54-b', port: 8122 },
  { label: 'C', dir: 'expo-app-54-c', port: 8123 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sh = (cmd) => { try { execSync(cmd, { stdio: 'ignore' }) } catch {} }

async function get(url, ms, headers = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal, headers }); return { ok: r.ok, body: await r.text() } }
  catch (e) { return { ok: false, body: '', error: String(e.message || e) } }
  finally { clearTimeout(t) }
}

const countChar = (s, ch) => { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] === ch) n++; return n }

async function buildOnce(app) {
  const dir = path.join(BENCH, app.dir)
  const base = `http://localhost:${app.port}/`
  sh(`lsof -tiTCP:${app.port} -sTCP:LISTEN | xargs kill -9`)
  await sleep(400)

  const metro = spawn('npx', ['expo', 'start', '--port', String(app.port)],
    { cwd: dir, env: { ...process.env, CI: '1', BROWSER: 'none' }, detached: true, stdio: 'ignore' })
  const kill = () => { try { process.kill(-metro.pid, 'SIGKILL') } catch {} }
  try {
    const dl = Date.now() + 180000
    let up = false
    while (Date.now() < dl) {
      if (metro.exitCode != null) break
      const r = await get(base + 'status', 2000)
      if (r.ok && r.body.includes('running')) { up = true; break }
      await sleep(500)
    }
    if (!up) throw new Error('Metro did not become ready')

    // resolve the exact device bundle URL Metro would hand the app
    const man = await get(base, 20000, { 'expo-platform': 'ios', Accept: 'application/expo+json,application/json' })
    let url
    try { url = JSON.parse(man.body).launchAsset.url } catch { url = null }
    if (!url) url = base + 'index.bundle?platform=ios&dev=true&hot=false'

    // isolate THIS build's hit/miss telemetry (the shared store persists across apps)
    fs.writeFileSync(STATS, '')
    const t0 = Date.now()
    const bundle = await get(url, 300000)
    const ms = Date.now() - t0
    if (!bundle.ok) throw new Error('bundle request failed: ' + (bundle.error || ''))

    const stats = fs.existsSync(STATS) ? fs.readFileSync(STATS, 'utf8') : ''
    const hits = countChar(stats, 'H'), miss = countChar(stats, 'M')
    return { modules: hits + miss, hits, miss, ms, bytes: bundle.body.length }
  } finally { kill(); await sleep(600) }
}

async function main() {
  // back up the caller's cache, start cold
  const bakStore = STORE + '.bench-bak', bakStats = STATS + '.bench-bak'
  if (fs.existsSync(STORE)) fs.renameSync(STORE, bakStore)
  if (fs.existsSync(STATS)) fs.renameSync(STATS, bakStats)
  fs.mkdirSync(STORE, { recursive: true }); fs.writeFileSync(STATS, '')

  const rows = []
  try {
    for (const app of APPS) {
      process.stdout.write(`building ${app.label.padEnd(24)} `)
      const r = await buildOnce(app)
      const rate = r.modules ? (100 * r.hits / r.modules) : 0
      rows.push({ ...app, ...r, rate })
      console.log(`modules=${r.modules}  ${r.hits} hits / ${r.miss} miss  ${rate.toFixed(1)}%  ${r.ms}ms`)
    }
  } finally {
    // restore the caller's cache
    fs.rmSync(STORE, { recursive: true, force: true }); fs.rmSync(STATS, { force: true })
    if (fs.existsSync(bakStore)) fs.renameSync(bakStore, STORE)
    if (fs.existsSync(bakStats)) fs.renameSync(bakStats, STATS)
  }

  console.log('\n| project | modules | bundle time | hit-rate |')
  console.log('|---|---:|---:|---:|')
  for (const r of rows) {
    const hr = r.label.startsWith('A') ? '—' : `${r.rate.toFixed(1)}% (${r.hits}/${r.modules})`
    console.log(`| ${r.label} | ${r.modules.toLocaleString()} | ${r.ms.toLocaleString()} ms | ${hr} |`)
  }
  const speed = rows[0] && rows[2] && rows[2].ms ? (rows[0].ms / rows[2].ms).toFixed(1) : '?'
  console.log(`\nA cold ${rows[0]?.ms}ms -> C warm ${rows[2]?.ms}ms  =  ${speed}x faster (explained by C's hit count)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
