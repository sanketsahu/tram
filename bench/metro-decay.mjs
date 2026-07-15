#!/usr/bin/env node
// Q1: After the cold-bundle spike, does Metro release the memory or hold it?
// Starts Expo (cold cache), serves one native bundle, then samples RSS every 1s
// for 60s and prints the decay curve.

import { spawn, execSync } from 'node:child_process'

const APP = new URL('expo-app/', import.meta.url).pathname
const PORT = 8081
const READY = `http://localhost:${PORT}/status`
const BUNDLE = `http://localhost:${PORT}/node_modules/expo-router/entry.bundle?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MB = (kb) => Math.round(kb / 1024)

function rssOf(pgid) {
  const out = execSync('ps -Ao pgid=,rss=', { encoding: 'utf8' })
  let total = 0
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (m && +m[1] === pgid) total += +m[2]
  }
  return total
}
async function get(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal }); await r.text(); return r.ok }
  catch { return false } finally { clearTimeout(t) }
}

// cold cache
execSync(`rm -rf $TMPDIR/metro-cache $TMPDIR/metro-file-map-*`, { shell: '/bin/zsh' })
try { execSync(`lsof -ti tcp:${PORT} | xargs kill -9`, { stdio: 'ignore' }) } catch {}
await sleep(500)

const child = spawn('npx', ['expo', 'start', '--port', String(PORT)], {
  cwd: APP, env: { ...process.env, CI: '1' }, detached: true, stdio: 'ignore',
})
const pg = child.pid
process.on('exit', () => { try { process.kill(-pg, 'SIGKILL') } catch {} })

// wait ready
const dl = Date.now() + 120000
while (Date.now() < dl) { if (await get(READY, 2000)) break; await sleep(500) }
console.log(`idle-ready RSS: ${MB(rssOf(pg))} MB`)

// cold bundle
console.log('cold bundling...')
const t0 = Date.now()
await get(BUNDLE, 120000)
console.log(`bundle done in ${Date.now() - t0}ms, RSS now ${MB(rssOf(pg))} MB`)

// decay curve: 60s
console.log('\nt(s)\tRSS(MB)')
let peak = 0
for (let i = 0; i <= 60; i++) {
  const rss = MB(rssOf(pg))
  peak = Math.max(peak, rss)
  if (i % 3 === 0) console.log(`${i}\t${rss}`)
  await sleep(1000)
}
console.log(`\npeak during window: ${peak} MB, final: ${MB(rssOf(pg))} MB`)
try { process.kill(-pg, 'SIGKILL') } catch {}
process.exit(0)
