#!/usr/bin/env node
// Memory benchmark harness for dev servers.
// Starts a dev server, waits until ready, fires a representative "first load"
// request (for Metro: a full native bundle), and samples RSS of the whole
// process tree throughout. Reports idle-ready RSS, post-warm RSS, and peak RSS.
//
// RSS (resident set size) is the standard "how much RAM is this using" proxy.
// It can overcount shared pages, but for a relative comparison of dev servers
// on the same machine it is the right signal.
//
// Usage: node measure.mjs <target>
//   targets: vite | next | expo-native | expo-web

import { spawn, execSync } from 'node:child_process'

const TARGETS = {
  vite: {
    cwd: 'vite-app',
    cmd: 'npm',
    args: ['run', 'dev', '--', '--port', '5173', '--strictPort'],
    env: {},
    ready: 'http://localhost:5173/',
    // Force Vite to transform the entry + app modules (it is lazy/on-demand).
    warm: [
      'http://localhost:5173/',
      'http://localhost:5173/src/main.tsx',
      'http://localhost:5173/src/App.tsx',
    ],
  },
  next: {
    cwd: 'next-app',
    cmd: 'npm',
    args: ['run', 'dev', '--', '--port', '3000'],
    env: {},
    ready: 'http://localhost:3000/',
    // Next compiles the route on first request.
    warm: ['http://localhost:3000/'],
  },
  'expo-native': {
    cwd: 'expo-app',
    cmd: 'npx',
    args: ['expo', 'start', '--port', '8081'],
    env: { CI: '1' },
    ready: 'http://localhost:8081/status',
    // The real Metro workload: the exact bundle URL Expo hands the device.
    warm: ['http://localhost:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable'],
  },
  'expo-web': {
    cwd: 'expo-app',
    cmd: 'npx',
    args: ['expo', 'start', '--port', '8082'],
    env: { CI: '1' },
    ready: 'http://localhost:8082/status',
    warm: ['http://localhost:8082/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.routerRoot=src%2Fapp'],
  },
}

const target = process.argv[2]
const cfg = TARGETS[target]
if (!cfg) {
  console.error(`unknown target "${target}". options: ${Object.keys(TARGETS).join(', ')}`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Sum RSS (KB) and count of every process in the process group `pgid`.
// We spawn detached, so the child is the group leader (pgid === child.pid) and
// all workers it spawns inherit the pgid. This survives re-parenting (e.g. npm
// exiting and leaving vite behind), which a parent-walk does not.
function treeRss(pgid) {
  let out
  try {
    out = execSync('ps -Ao pgid=,rss=', { encoding: 'utf8' })
  } catch {
    return { rssKB: 0, procs: 0 }
  }
  let total = 0, procs = 0
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (!m) continue
    if (+m[1] === pgid) { total += +m[2]; procs++ }
  }
  return { rssKB: total, procs }
}

async function tryFetch(url, timeoutMs = 3000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const body = await res.text()
    return { ok: res.ok, status: res.status, len: body.length }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  } finally {
    clearTimeout(t)
  }
}

const samples = []
function sample(root, phase) {
  const { rssKB, procs } = treeRss(root)
  samples.push({ t: Date.now(), rssKB, procs, phase })
  return rssKB
}

async function main() {
  const cwd = new URL(cfg.cwd + '/', import.meta.url).pathname

  // Preflight: kill anything already bound to the port so we measure a cold start.
  const port = new URL(cfg.ready).port
  try { execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: 'ignore' }) } catch {}
  await sleep(500)

  const started = Date.now()
  const child = spawn(cfg.cmd, cfg.args, {
    cwd,
    env: { ...process.env, ...cfg.env, BROWSER: 'none', CI: cfg.env.CI ?? process.env.CI },
    detached: true,
    stdio: 'ignore',
  })
  const root = child.pid

  const cleanup = () => {
    try { process.kill(-root, 'SIGKILL') } catch {}
    try { child.kill('SIGKILL') } catch {}
  }
  process.on('exit', cleanup)

  // Poll readiness while sampling.
  let ready = false
  const readyDeadline = Date.now() + 180000
  while (Date.now() < readyDeadline) {
    sample(root, 'startup')
    const r = await tryFetch(cfg.ready, 2000)
    if (r.ok) { ready = true; break }
    await sleep(500)
  }
  const readyAt = Date.now()
  if (!ready) {
    cleanup()
    console.log(JSON.stringify({ target, error: 'never became ready', samples: samples.length }))
    process.exit(1)
  }

  // Idle-ready window: let it settle, sample for 4s.
  for (let i = 0; i < 8; i++) { sample(root, 'idle'); await sleep(500) }
  const idleRss = Math.max(...samples.filter((s) => s.phase === 'idle').map((s) => s.rssKB))

  // Warm: fire the representative first-load request(s).
  const warmStart = Date.now()
  const warmResults = []
  for (const url of cfg.warm) {
    // sample during the (possibly long) bundle
    const p = tryFetch(url, 120000)
    let done = false
    p.then(() => { done = true })
    while (!done) { sample(root, 'warm'); await sleep(300) }
    warmResults.push({ url, ...(await p) })
  }
  const warmMs = Date.now() - warmStart

  // Post-warm settle window.
  for (let i = 0; i < 10; i++) { sample(root, 'post'); await sleep(500) }

  const postRss = Math.max(...samples.filter((s) => s.phase === 'post').map((s) => s.rssKB))
  const peakRss = Math.max(...samples.map((s) => s.rssKB))
  const peakProcs = Math.max(...samples.map((s) => s.procs))

  cleanup()

  const MB = (kb) => Math.round(kb / 1024)
  console.log(JSON.stringify({
    target,
    readyMs: readyAt - started,
    warmMs,
    procs: peakProcs,
    idleReadyMB: MB(idleRss),
    postWarmMB: MB(postRss),
    peakMB: MB(peakRss),
    warm: warmResults,
  }, null, 2))
  process.exit(0)
}

main()
