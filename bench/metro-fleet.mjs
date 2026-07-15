#!/usr/bin/env node
// Q2: N concurrent cold Metro bundles. Starts N isolated Expo instances (each its
// own cache dir so all are cold, each its own port), waits for all to be ready,
// then fires all bundle requests SIMULTANEOUSLY while sampling aggregate RSS.
//
// Usage: node metro-fleet.mjs <N>

import { spawn, execSync } from 'node:child_process'
import { mkdirSync as mkdir } from 'node:fs'

const N = parseInt(process.argv[2] || '2', 10)
const APP = new URL('expo-app/', import.meta.url).pathname
const BASE = 8100
const bundleUrl = (port) =>
  `http://localhost:${port}/node_modules/expo-router/entry.bundle?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MB = (kb) => Math.round(kb / 1024)

function aggRss(pgids) {
  const set = new Set(pgids)
  const out = execSync('ps -Ao pgid=,rss=', { encoding: 'utf8' })
  let total = 0
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (m && set.has(+m[1])) total += +m[2]
  }
  return total
}
async function get(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal }); await r.text(); return r.ok }
  catch { return false } finally { clearTimeout(t) }
}

const ports = Array.from({ length: N }, (_, i) => BASE + i)
for (const p of ports) { try { execSync(`lsof -ti tcp:${p} | xargs kill -9`, { stdio: 'ignore' }) } catch {} }
await sleep(500)

const children = []
const pgids = []
for (let i = 0; i < N; i++) {
  const port = ports[i]
  const tmp = `/tmp/fleet-${N}-${i}`
  try { mkdir(tmp, { recursive: true }) } catch {}
  const child = spawn('npx', ['expo', 'start', '--port', String(port)], {
    cwd: APP,
    env: { ...process.env, CI: '1', TMPDIR: tmp + '/' },
    detached: true, stdio: 'ignore',
  })
  children.push(child); pgids.push(child.pid)
}
const killAll = () => { for (const pg of pgids) { try { process.kill(-pg, 'SIGKILL') } catch {} } }
process.on('exit', killAll)

// wait until all N ready
const dl = Date.now() + 180000
const ready = new Set()
while (Date.now() < dl && ready.size < N) {
  for (const p of ports) if (!ready.has(p) && await get(`http://localhost:${p}/status`, 2000)) ready.add(p)
  await sleep(500)
}
if (ready.size < N) { console.log(JSON.stringify({ N, error: `only ${ready.size}/${N} ready` })); killAll(); process.exit(1) }
await sleep(2000)
const idle = aggRss(pgids)

// fire ALL bundle requests at once
let sampling = true
let peak = 0
const sampler = (async () => { while (sampling) { peak = Math.max(peak, aggRss(pgids)); await sleep(250) } })()
const t0 = Date.now()
await Promise.all(ports.map((p) => get(bundleUrl(p), 180000)))
const bundleMs = Date.now() - t0
// let spikes settle a moment, keep sampling
await sleep(3000)
sampling = false
await sampler
const settled = aggRss(pgids)

killAll()
console.log(JSON.stringify({
  N,
  bundleMs,
  aggIdleMB: MB(idle),
  aggPeakMB: MB(peak),
  perInstanceIdleMB: Math.round(MB(idle) / N),
  perInstancePeakMB: Math.round(MB(peak) / N),
  aggSettledMB: MB(settled),
}, null, 2))
process.exit(0)
