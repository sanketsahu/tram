#!/usr/bin/env node
// Measure boot time: plain Vite vs `jetplane dev`, across cold / warm / cross-project.
// Boot = wall-clock from process spawn to first successful HTTP 200.

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'

const ROOT = '/Users/sanketsahu/projects/jetplane'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ok(url) {
  try { const r = await fetch(url); await r.text(); return r.ok } catch { return false }
}

// Kill ONLY the server we spawned, via its own process group (detached). Never
// lsof-by-port: the harness itself holds client sockets on that port, so lsof would
// return (and kill) our own PID.
async function boot(cmd, args, cwd, port) {
  const t0 = performance.now()
  const child = spawn(cmd, args, { cwd, env: { ...process.env, BROWSER: 'none' }, detached: true, stdio: 'ignore' })
  child.on('error', (e) => console.error('  spawn error:', e.message))
  const url = `http://localhost:${port}/`
  let ms = -1
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) { if (await ok(url)) { ms = performance.now() - t0; break } await sleep(50) }
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
  await sleep(1000)
  return ms
}

const dirSize = (d) => { try { return parseInt(execSync(`du -sk "${d}"`).toString().split(/\s+/)[0], 10) } catch { return 0 } }
const clear = (d) => { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }

// default to the LIGHT app (safe under memory pressure); pass a dir to override
const APPNAME = process.argv[2] || 'vite-app'
const HEAVY = `${ROOT}/bench/${APPNAME}`
const COPY = `${ROOT}/bench/${APPNAME}-copy`
const HOME = process.env.HOME
const results = []
const R = (label, ms, note = '') => { results.push({ label, ms: Math.round(ms), note }); console.log(`  ${label.padEnd(38)} ${String(Math.round(ms) + ' ms').padStart(9)}  ${note}`) }

console.log('\n--- plain Vite (baseline) ---')
clear(`${HEAVY}/node_modules/.vite`)
R('plain vite: COLD (fresh optimize)', await boot('npm', ['run', 'dev', '--', '--port', '5191', '--strictPort'], HEAVY, 5191), 'builds node_modules/.vite')
R('plain vite: WARM (2nd run)', await boot('npm', ['run', 'dev', '--', '--port', '5191', '--strictPort'], HEAVY, 5191), 'reuses node_modules/.vite')

console.log('\n--- jetplane dev ---')
clear(`${HOME}/.jetplane/vite`)
R('jetplane: COLD (build shared prebundle)', await boot('bun', [`${ROOT}/src/cli.ts`, 'dev', HEAVY, '--port', '5192'], ROOT, 5192), 'builds ~/.jetplane/vite/<hash>')
R('jetplane: WARM (2nd run, same project)', await boot('bun', [`${ROOT}/src/cli.ts`, 'dev', HEAVY, '--port', '5192'], ROOT, 5192), 'reuses shared prebundle')
R('jetplane: WARM (different project, same deps)', await boot('bun', [`${ROOT}/src/cli.ts`, 'dev', COPY, '--port', '5193'], ROOT, 5193), 'cross-project reuse = fleet win')

console.log('\n--- disk ---')
const shared = dirSize(`${HOME}/.jetplane/vite`)
const perProj = dirSize(`${HEAVY}/node_modules/.vite`)
console.log(`  ~/.jetplane/vite (shared across ALL same-dep projects): ${(shared / 1024).toFixed(1)} MB`)
console.log(`  heavy-app/node_modules/.vite (per project, plain) : ${(perProj / 1024).toFixed(1)} MB`)

console.log('\nsummary:', JSON.stringify(results))
