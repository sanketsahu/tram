#!/usr/bin/env node
// Tram cache prototype — Vite testbed.
//
// Tests the content-addressed transform cache thesis on the REAL vite-app module
// graph, and measures the states that matter for the "resident service + warm cache"
// model:
//   cold   : transform every module (first-ever build; no cache)
//   warm   : every module is a content-addressed cache HIT (boot from per-file store)
//   packed : the whole base image is one file, read once (mmap-style boot)
// plus the two cache-bust triggers:
//   edit-1 : one app file changes  -> 1 module re-hashes + re-transforms
//   add-1  : app reaches one new module (new tree-trace) -> resolve+transform 1
//   install: lockfile changes -> new manifest, unchanged modules stay hits
//
// The point is the DELTAS between states, and the boot time + memory of the warm
// path, since that is what a resident multi-tenant server pays per environment.

import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Usage: node cache-bench.mjs [appDir] [entryRelative]
const APP = process.argv[2] || '/Users/sanketsahu/projects/tram/bench/vite-app'
const ENTRY = path.join(APP, process.argv[3] || 'src/main.tsx')
const TAG = path.basename(APP)
const STORE = `/Users/sanketsahu/projects/tram/prototype/store-${TAG}`
const PACKED = `/Users/sanketsahu/projects/tram/prototype/base-image-${TAG}.pack`

const require = createRequire(import.meta.url)
const esbuild = require('esbuild')
const TOOLCHAIN = `esbuild@${esbuild.version};tsx;browser;automatic;v1`

const LOADERS = { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'jsx', '.mjs': 'jsx', '.cjs': 'jsx', '.css': 'css', '.svg': 'text', '.png': 'dataurl', '.json': 'json' }
const loaderFor = (f) => LOADERS[path.extname(f)] || 'text'

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const keyOf = (src, loader) => sha(`${TOOLCHAIN}\0${loader}\0${src}`)

const now = () => Number(process.hrtime.bigint()) / 1e6 // ms
const MB = (b) => Math.round(b / 1048576)
const KB = (b) => Math.round(b / 1024)

// peak-RSS sampler (works because our hot loops await async esbuild calls)
function startSampler() {
  let peak = process.memoryUsage().rss
  const iv = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 3)
  return () => { clearInterval(iv); return peak }
}

async function getGraph() {
  const r = await esbuild.build({
    entryPoints: [ENTRY], bundle: true, metafile: true, write: false,
    format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    loader: LOADERS, absWorkingDir: APP, outdir: 'out',
  })
  const files = Object.keys(r.metafile.inputs)
    .map((p) => path.isAbsolute(p) ? p : path.join(APP, p))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
  return files
}

async function transformOne(file) {
  const src = fs.readFileSync(file, 'utf8')
  const loader = loaderFor(file)
  const out = await esbuild.transform(src, { loader, format: 'esm', jsx: 'automatic', logLevel: 'silent' })
  return { key: keyOf(src, loader), code: out.code }
}

const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }) } catch {} }
const ensure = (p) => { try { fs.mkdirSync(p, { recursive: true }) } catch {} }

// ---- phases -------------------------------------------------------------

async function phaseCold(files) {
  rmrf(STORE); ensure(STORE)
  const stop = startSampler(); const t0 = now()
  let bytes = 0
  for (const f of files) {
    const { key, code } = await transformOne(f)
    const dst = path.join(STORE, key + '.js')
    if (!fs.existsSync(dst)) fs.writeFileSync(dst, code)
    bytes += Buffer.byteLength(code)
  }
  const ms = now() - t0; const peak = stop()
  return { ms, peakRss: peak, outBytes: bytes, entries: files.length }
}

// warm boot: every module is a hit -> read store + assemble the servable image
async function phaseWarm(files) {
  // precompute keys (a resident server keeps the manifest in memory; we include the
  // hash cost so the number is honest, but no transform happens)
  const stop = startSampler(); const t0 = now()
  const parts = []
  let hits = 0, miss = 0
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    const key = keyOf(src, loaderFor(f))
    const dst = path.join(STORE, key + '.js')
    if (fs.existsSync(dst)) { parts.push(fs.readFileSync(dst, 'utf8')); hits++ }
    else miss++
  }
  const image = parts.join('\n')
  const ms = now() - t0; const peak = stop()
  return { ms, peakRss: peak, hits, miss, imageBytes: Buffer.byteLength(image) }
}

// pack the base image once (resident server does this at cache-build time, not boot)
function buildPack(files) {
  const parts = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    const key = keyOf(src, loaderFor(f))
    const dst = path.join(STORE, key + '.js')
    if (fs.existsSync(dst)) parts.push(fs.readFileSync(dst, 'utf8'))
  }
  fs.writeFileSync(PACKED, parts.join('\n'))
}

// packed boot: read ONE file (mmap-style). This is the resident-server boot number.
function phasePacked() {
  const stop = startSampler(); const t0 = now()
  const image = fs.readFileSync(PACKED)
  const len = image.length // touch it
  const ms = now() - t0; const peak = stop()
  return { ms, peakRss: peak, imageBytes: len }
}

// bust: edit one app file -> exactly one module re-hashes + re-transforms
async function phaseEditOne(files) {
  const appFile = files.find((f) => f.includes('/src/App.tsx')) || files.find((f) => !f.includes('node_modules'))
  const src = fs.readFileSync(appFile, 'utf8')
  const mutated = src + `\n// tram-edit ${Date.now()}\n`
  const loader = loaderFor(appFile)
  const stop = startSampler(); const t0 = now()
  const out = await esbuild.transform(mutated, { loader, format: 'esm', jsx: 'automatic', logLevel: 'silent' })
  const key = keyOf(mutated, loader)
  const dst = path.join(STORE, key + '.js')
  const wasHit = fs.existsSync(dst)
  if (!wasHit) fs.writeFileSync(dst, out.code)
  const ms = now() - t0; const peak = stop()
  return { ms, peakRss: peak, file: path.relative(APP, appFile), recomputed: !wasHit }
}

// bust: app reaches one brand-new vendor module (new tree-trace) -> transform 1.
// Simulate "new" by mutating a vendor file's bytes so its hash misses the store.
async function phaseAddOne(files) {
  const target = files.find((f) => f.includes('node_modules')) || files[0]
  const src = fs.readFileSync(target, 'utf8') + `\n// tram-new ${Date.now()}\n`
  const loader = loaderFor(target)
  const stop = startSampler(); const t0 = now()
  const out = await esbuild.transform(src, { loader, format: 'esm', jsx: 'automatic', logLevel: 'silent' })
  const key = keyOf(src, loader)
  const dst = path.join(STORE, key + '.js')
  const wasHit = fs.existsSync(dst)
  if (!wasHit) fs.writeFileSync(dst, out.code)
  const ms = now() - t0; const peak = stop()
  return { ms, peakRss: peak, file: path.relative(APP, target), recomputed: !wasHit }
}

// ---- driver -------------------------------------------------------------

function storeSize() {
  let bytes = 0, n = 0
  for (const f of fs.readdirSync(STORE)) { bytes += fs.statSync(path.join(STORE, f)).size; n++ }
  return { bytes, n }
}
function dirSize(dir) {
  let bytes = 0
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else try { bytes += fs.statSync(p).size } catch {} } }
  try { walk(dir) } catch {}
  return bytes
}

console.log('resolving real module graph of vite-app...')
const files = await getGraph()
const vendor = files.filter((f) => f.includes('node_modules')).length
const app = files.length - vendor
console.log(`  ${files.length} modules  (app: ${app}, vendor: ${vendor})`)

console.log('\n[cold]  transform every module, populate store')
const cold = await phaseCold(files)

console.log('[warm]  every module a cache hit, assemble image (per-file store)')
const warm = await phaseWarm(files)

console.log('[pack]  build single base image, then boot from it')
buildPack(files)
const packed = phasePacked()

console.log('[edit]  bust: edit 1 app file')
const edit = await phaseEditOne(files)

console.log('[add]   bust: reach 1 new vendor module (new tree-trace)')
const add = await phaseAddOne(files)

const store = storeSize()
const nm = dirSize(path.join(APP, 'node_modules'))

const line = (label, o) => console.log(
  `  ${label.padEnd(8)} ${String(o.ms.toFixed(2) + ' ms').padStart(12)}   peakRSS ${String(MB(o.peakRss) + ' MB').padStart(8)}` +
  (o.extra ? '   ' + o.extra : '')
)

console.log('\n================= RESULTS =================')
console.log(`graph: ${files.length} modules (${app} app / ${vendor} vendor)`)
line('cold', { ...cold, extra: `${cold.entries} transforms, out ${KB(cold.outBytes)} KB` })
line('warm', { ...warm, extra: `${warm.hits} hits / ${warm.miss} miss, image ${KB(warm.imageBytes)} KB` })
line('packed', { ...packed, extra: `1 read, image ${KB(packed.imageBytes)} KB` })
line('edit-1', { ...edit, extra: `${edit.file} (recomputed ${edit.recomputed})` })
line('add-1', { ...add, extra: `${add.file} (recomputed ${add.recomputed})` })
console.log('\ndisk:')
console.log(`  shared content-addressed store : ${MB(store.bytes)} MB (${store.n} entries)  <- shared across ALL envs`)
console.log(`  vite-app/node_modules          : ${MB(nm)} MB  <- per env today`)
console.log(`\nboot speedup cold->packed: ${(cold.ms / packed.ms).toFixed(0)}x`)
console.log(`memory: cold peak ${MB(cold.peakRss)} MB vs packed boot ${MB(packed.peakRss)} MB`)
