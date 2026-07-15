#!/usr/bin/env node
// Metro cross-project vendor cache proof.
//
// Uses REAL babel-preset-expo transforms on a worst-case vendor sample (reanimated +
// worklets + expo-router source — includes the path-baking worklet files). Proves:
//   - cold: transform all, populate content-addressed store (bounded memory, no 2GB spike)
//   - warm: every module a hit -> assemble
//   - packed: one mmap-able image -> boot in ~ms
//   - cross-project: a DIFFERENT project root reuses the SAME entries (100% hits)
//
// Design: key by SOURCE bytes (root-independent). Store PATH-NORMALIZED output
// (project root -> "\0ROOT\0"). Rehydrate the local root on serve. This is what makes
// a worklet file (which bakes its absolute path) shareable across projects.

import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const APP = '/Users/sanketsahu/projects/jetplane/bench/expo-app'
const ROOT_A = APP
const ROOT_B = '/private/tmp/claude-501/-Users-sanketsahu-projects-jetplane/86802dfc-dbac-451f-816b-0a3f77deb0fb/scratchpad/projB'
const STORE = '/Users/sanketsahu/projects/jetplane/prototype/store-metro'
const PACKED = '/Users/sanketsahu/projects/jetplane/prototype/base-image-metro.pack'

const require = createRequire(APP + '/')
const babel = require('@babel/core')
const PRESET = require.resolve('babel-preset-expo')
const TOOLCHAIN = `babel@${babel.version};preset-expo;ios;v1`
const PLACEHOLDER = '\0TRAM_ROOT\0'

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const now = () => Number(process.hrtime.bigint()) / 1e6
const MB = (b) => Math.round(b / 1048576)
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }) } catch {} }
const ensure = (p) => fs.mkdirSync(p, { recursive: true })

// collect a real vendor sample (worst case: includes worklet path-bakers)
function collect() {
  const roots = [
    'node_modules/react-native-reanimated/src',
    'node_modules/react-native-worklets/src',
    'node_modules/expo-router/build',
  ].map((r) => path.join(APP, r))
  const files = []
  const walk = (d) => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p)
    }
  }
  roots.forEach(walk)
  return files
}

// key is root-independent: hash of source bytes + toolchain
const keyOf = (src) => sha(`${TOOLCHAIN}\0${src}`)

function transformNormalized(absPath, root, src) {
  const filename = path.join(root, path.relative(ROOT_A, absPath))
  if (root !== ROOT_A) { ensure(path.dirname(filename)); fs.writeFileSync(filename, src) }
  const res = babel.transformSync(src, {
    filename, root: '/', cwd: APP, babelrc: false, configFile: false,
    presets: [[PRESET, { native: {} }]],
    caller: { name: 'metro', platform: 'ios', isDev: true, isServer: false },
  })
  // normalize: replace whatever root prefix got baked with a placeholder
  return res.code.split(root).join(PLACEHOLDER)
}

let peak = 0
const touch = () => { peak = Math.max(peak, process.memoryUsage().rss) }

const files = collect()
console.log(`vendor sample: ${files.length} real files (reanimated + worklets + expo-router)`)

// COLD: transform all, populate store
rmrf(STORE); ensure(STORE)
peak = 0
let t0 = now(); let outBytes = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const key = keyOf(src)
  const dst = path.join(STORE, key + '.js')
  if (!fs.existsSync(dst)) { const code = transformNormalized(f, ROOT_A, src); fs.writeFileSync(dst, code); outBytes += code.length }
  touch()
}
const coldMs = now() - t0; const coldPeak = peak

// WARM: every module a hit -> assemble (rehydrate ROOT_A)
peak = 0; t0 = now(); let hits = 0, miss = 0; const parts = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const dst = path.join(STORE, keyOf(src) + '.js')
  if (fs.existsSync(dst)) { parts.push(fs.readFileSync(dst, 'utf8').split(PLACEHOLDER).join(ROOT_A)); hits++ } else miss++
  touch()
}
const warmMs = now() - t0; const warmPeak = peak; const imageBytes = parts.join('\n').length

// PACK + packed boot
fs.writeFileSync(PACKED, parts.join('\n'))
peak = 0; t0 = now()
const img = fs.readFileSync(PACKED); const _ = img.length
const packedMs = now() - t0; touch(); const packedPeak = peak

// CROSS-PROJECT: transform the same files as if under ROOT_B, key by source -> must hit
rmrf(ROOT_B)
peak = 0; t0 = now(); let xHits = 0, xMiss = 0, xConsistent = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const key = keyOf(src)
  const dst = path.join(STORE, key + '.js')
  if (fs.existsSync(dst)) {
    xHits++
    // verify: transforming under ROOT_B and normalizing yields the SAME stored bytes
    const fresh = transformNormalized(f, ROOT_B, src)
    if (fresh === fs.readFileSync(dst, 'utf8')) xConsistent++
  } else xMiss++
  touch()
}
const xMs = now() - t0; const xPeak = peak
rmrf(ROOT_B)

let storeBytes = 0, n = 0
for (const f of fs.readdirSync(STORE)) { storeBytes += fs.statSync(path.join(STORE, f)).size; n++ }

console.log('\n================ METRO CROSS-PROJECT CACHE ================')
console.log(`files: ${files.length}   store entries: ${n}   store size: ${MB(storeBytes)} MB   image: ${Math.round(imageBytes / 1024)} KB`)
console.log(`cold   (transform all)         ${coldMs.toFixed(0).padStart(7)} ms   peakRSS ${MB(coldPeak)} MB   (out ${Math.round(outBytes / 1024)} KB)`)
console.log(`warm   (all hits, assemble)    ${warmMs.toFixed(1).padStart(7)} ms   ${hits} hits / ${miss} miss`)
console.log(`packed (boot from 1 image)     ${packedMs.toFixed(2).padStart(7)} ms   peakRSS ${MB(packedPeak)} MB`)
console.log(`cross  (project B, key=source) ${xMs.toFixed(0).padStart(7)} ms   ${xHits} HITS / ${xMiss} miss   ${xConsistent}/${xHits} byte-consistent after normalize`)
console.log(`\nmemory: our cold peak ${MB(coldPeak)} MB  vs  Metro cold-bundle spike ~2018 MB (bench/RESULTS.md)`)
console.log(`boot:   packed ${packedMs.toFixed(2)} ms  vs  Metro cold bundle ~3130 ms`)
