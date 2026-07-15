#!/usr/bin/env node
// Honest boot measurement: crawl the module graph like a browser does.
// boot-to-loaded = spawn -> every module reachable from index.html served (200).
// This actually exercises the vendor path (triggers any dep optimization), unlike a
// single curl. Kills are pgid-scoped only (never lsof-by-port, never broad pkill).

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'

const ROOT = '/Users/sanketsahu/projects/tram'
const APP = process.argv[2] || 'vite-app'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, ms = 10000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal }); const body = await r.text(); return { ok: r.ok, status: r.status, body, ct: r.headers.get('content-type') || '' } }
  catch { return { ok: false, status: 0, body: '', ct: '' } }
  finally { clearTimeout(t) }
}

// extract same-origin module URLs from an HTML or JS payload
function extractUrls(base, payload, isHtml) {
  const urls = new Set()
  if (isHtml) {
    for (const m of payload.matchAll(/<script[^>]+type=["']module["'][^>]*\ssrc=["']([^"']+)["']/g)) urls.add(m[1])
    urls.add('/@vite/client')
  }
  for (const re of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']/g]) {
    for (const m of payload.matchAll(re)) urls.add(m[1])
  }
  const out = []
  for (const u of urls) {
    if (u.startsWith('data:') || u.startsWith('http://') && !u.includes('localhost')) continue
    try { out.push(new URL(u, base).href) } catch {}
  }
  return out
}

async function crawl(origin) {
  const seen = new Set()
  const queue = [origin + '/']
  let count = 0
  while (queue.length && count < 8000) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    if (!url.startsWith(origin)) continue
    const r = await get(url)
    count++
    if (!r.ok) continue
    const isHtml = url === origin + '/' || r.ct.includes('text/html')
    for (const next of extractUrls(url, r.body, isHtml)) if (!seen.has(next)) queue.push(next)
  }
  return seen.size
}

function startServer(cmd, args, cwd, port) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, BROWSER: 'none' }, detached: true, stdio: 'ignore' })
  return { pid: child.pid, kill: () => { try { process.kill(-child.pid, 'SIGKILL') } catch {} } }
}

async function measure(label, cmd, args, cwd, port, note = '') {
  const origin = `http://localhost:${port}`
  const t0 = performance.now()
  const srv = startServer(cmd, args, cwd, port)
  // first byte
  let firstByte = -1
  const dl = Date.now() + 90000
  while (Date.now() < dl) { const r = await get(origin + '/', 2000); if (r.ok) { firstByte = performance.now() - t0; break } await sleep(50) }
  let modules = 0, loaded = -1
  if (firstByte >= 0) { modules = await crawl(origin); loaded = performance.now() - t0 }
  srv.kill()
  await sleep(1200)
  console.log(`  ${label.padEnd(40)} firstByte ${String(Math.round(firstByte) + 'ms').padStart(8)}  loaded ${String(Math.round(loaded) + 'ms').padStart(8)}  modules ${String(modules).padStart(5)}  ${note}`)
  return { label, firstByte: Math.round(firstByte), loaded: Math.round(loaded), modules }
}

const HOME = process.env.HOME
const clear = (d) => { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }
const du = (d) => { try { return (parseInt(execSync(`du -sk "${d}"`).toString().split(/\s+/)[0], 10) / 1024).toFixed(1) } catch { return '0.0' } }

const appDir = `${ROOT}/bench/${APP}`
const copyDir = `${ROOT}/bench/${APP}-copy`
const results = []

console.log(`\n=== boot-to-loaded: plain Vite vs tram  (app=${APP}) ===`)
console.log('\n--- plain Vite ---')
clear(`${appDir}/node_modules/.vite`)
results.push(await measure('plain vite: COLD', 'npm', ['run', 'dev', '--', '--port', '5191', '--strictPort'], appDir, 5191, 'fresh'))
results.push(await measure('plain vite: WARM (2nd run)', 'npm', ['run', 'dev', '--', '--port', '5191', '--strictPort'], appDir, 5191, 'reuse .vite'))

console.log('\n--- tram dev ---')
clear(`${HOME}/.tram/vite`)
results.push(await measure('tram: COLD', 'bun', [`${ROOT}/src/cli.ts`, 'dev', appDir, '--port', '5192'], ROOT, 5192, 'build shared'))
results.push(await measure('tram: WARM (2nd run, same project)', 'bun', [`${ROOT}/src/cli.ts`, 'dev', appDir, '--port', '5192'], ROOT, 5192, 'reuse shared'))
if (fs.existsSync(copyDir))
  results.push(await measure('tram: WARM (diff project, same deps)', 'bun', [`${ROOT}/src/cli.ts`, 'dev', copyDir, '--port', '5193'], ROOT, 5193, 'cross-project'))

console.log('\n--- disk ---')
console.log(`  plain vite  ${appDir}/node_modules/.vite : ${du(`${appDir}/node_modules/.vite`)} MB (per project)`)
console.log(`  tram shared ~/.tram/vite                 : ${du(`${HOME}/.tram/vite`)} MB (all same-dep projects)`)
console.log('\nsummary:', JSON.stringify(results))
