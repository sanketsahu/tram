#!/usr/bin/env node
// Measure the amortized Path-2 architecture:
//   1 shared transform service (node, babel loaded once) + N thin servers (bun, mmap vendor).
// Claim: each thin server stays ~55 MB even while serving bundles (babel is in the
// service, not the thin server); babel's ~200 MB is paid ONCE.
// Kills by PID only (each process is single; no lsof, no broad pkill).

import { spawn, execSync } from 'node:child_process'

const ROOT = '/Users/sanketsahu/projects/tram'
const APP = `${ROOT}/bench/expo-app`
const VIMG = `${ROOT}/prototype/base-image-metro.pack`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rss = (pid) => { try { return Math.round(parseInt(execSync(`ps -o rss= -p ${pid}`).toString().trim(), 10) / 1024) } catch { return -1 } }

async function waitUrl(url, ms = 30000) { const dl = Date.now() + ms; while (Date.now() < dl) { try { const r = await fetch(url); if (r.ok) return true } catch {} await sleep(100) } return false }
async function jget(url) { try { return await (await fetch(url)).json() } catch { return null } }

const procs = []
const spawnProc = (cmd, args) => { const c = spawn(cmd, args, { cwd: ROOT, stdio: 'ignore', env: process.env }); procs.push(c); return c }
const killAll = () => { for (const c of procs) { try { c.kill('SIGKILL') } catch {} } }
process.on('exit', killAll)

const out = {}
try {
  // 1) shared transform service
  const svc = spawnProc('node', [`${ROOT}/src/transform-service.mjs`, APP, '8199'])
  await waitUrl('http://localhost:8199/health')
  await sleep(500)
  out.serviceStartRSS = rss(svc.pid)

  // 2) thin server #1
  const t1 = spawnProc('bun', [`${ROOT}/src/serve-expo.ts`, APP, '8091', VIMG, '8199'])
  await waitUrl('http://localhost:8091/status')
  await sleep(500)
  out.thin1_idleRSS = rss(t1.pid)

  // 3) serve a bundle (thin1 delegates transforms to the service)
  const t0 = performance.now()
  const r = await fetch('http://localhost:8091/index.bundle')
  const bundle = await r.text()
  out.bundleOK = r.ok && bundle.includes('app layer')
  out.bundleBytes = bundle.length
  out.assembleMs = Math.round(performance.now() - t0)
  await sleep(500)
  out.thin1_postBundleRSS = rss(t1.pid)
  out.serviceAfter1 = await jget('http://localhost:8199/health')

  // 4) serve again -> service should hit cache (transforms flat, hits grow)
  await fetch('http://localhost:8091/index.bundle')
  await sleep(300)
  out.serviceAfter2 = await jget('http://localhost:8199/health')

  // 5) two more thin servers (different ports) -> aggregate
  const t2 = spawnProc('bun', [`${ROOT}/src/serve-expo.ts`, APP, '8092', VIMG, '8199'])
  const t3 = spawnProc('bun', [`${ROOT}/src/serve-expo.ts`, APP, '8093', VIMG, '8199'])
  await waitUrl('http://localhost:8092/status'); await waitUrl('http://localhost:8093/status')
  await fetch('http://localhost:8092/index.bundle'); await fetch('http://localhost:8093/index.bundle')
  await sleep(500)
  out.thin2RSS = rss(t2.pid); out.thin3RSS = rss(t3.pid)
  out.serviceFinalRSS = rss(svc.pid)
  out.thinSum = out.thin1_postBundleRSS + out.thin2RSS + out.thin3RSS
} finally {
  killAll()
}

console.log(JSON.stringify(out, null, 2))
console.log('\n=== interpretation ===')
console.log(`shared service (babel, once): startup ${out.serviceStartRSS} MB -> after transforms ${out.serviceFinalRSS} MB`)
console.log(`thin server idle: ${out.thin1_idleRSS} MB   after serving a bundle: ${out.thin1_postBundleRSS} MB  (babel NOT in this process)`)
console.log(`3 thin servers: ${out.thin1_postBundleRSS} + ${out.thin2RSS} + ${out.thin3RSS} = ${out.thinSum} MB`)
console.log(`cache: transforms ${out.serviceAfter1?.transforms} then ${out.serviceAfter2?.transforms} (flat = 2nd serve hit cache), hits ${out.serviceAfter2?.hits}`)
console.log(`\nfleet cost model: ~${out.thin1_postBundleRSS} MB x N  +  ~${out.serviceFinalRSS} MB once`)
console.log(`vs Metro: ~325 MB x N idle, ~2018 MB x N cold-bundle spike`)
