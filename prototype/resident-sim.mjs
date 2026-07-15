#!/usr/bin/env node
// Fleet metric: marginal memory per environment in a resident multi-tenant server.
//
// Today (Metro): each env is its own process holding its own module graph -> the
// ~0.7-2.0 GB x N line we measured. This sim shows the two ends of the design space
// inside ONE resident process:
//
//   naive  : each env holds its OWN copy of the base image (Metro-like, no sharing)
//   shared : ONE base image buffer; each env references it + carries only its app delta
//
// The delta between the two is the entire thesis: vendor mass counted once, not per-N.
//
// Usage: node resident-sim.mjs <N> <naive|shared>

import fs from 'node:fs'

// Usage: node --expose-gc resident-sim.mjs <N> <naive|shared> [packedFile]
const N = parseInt(process.argv[2] || '200', 10)
const MODE = process.argv[3] || 'shared'
const PACKED = process.argv[4] || '/Users/sanketsahu/projects/tram/prototype/base-image-vite-app.pack'
const MB = (b) => (b / 1048576).toFixed(1)

if (!fs.existsSync(PACKED)) { console.error('run cache-bench.mjs first to build base-image.pack'); process.exit(1) }

// simulate a per-env app delta (the small mutable src/ layer): ~20 KB of code
const APP_DELTA = 'x'.repeat(20 * 1024)

global.gc && global.gc()
const rss0 = process.memoryUsage().rss

// The resident server loads the base image ONCE, up front.
const baseImage = fs.readFileSync(PACKED) // one Buffer

const envs = []
for (let i = 0; i < N; i++) {
  if (MODE === 'naive') {
    // each env gets its OWN copy of the vendor image (what per-process bundlers do)
    envs.push({ id: i, image: Buffer.from(baseImage), app: APP_DELTA.slice() })
  } else {
    // shared: reference the single base image buffer; hold only the per-env app delta
    envs.push({ id: i, image: baseImage, app: (APP_DELTA + i).slice(0) })
  }
}

global.gc && global.gc()
const rss1 = process.memoryUsage().rss
const grew = rss1 - rss0

// keep envs alive so GC can't drop them before measuring
console.log(JSON.stringify({
  mode: MODE,
  envs: N,
  baseImageMB: +MB(baseImage.length),
  rssBeforeMB: +MB(rss0),
  rssAfterMB: +MB(rss1),
  grewMB: +MB(grew),
  marginalPerEnvKB: +(grew / N / 1024).toFixed(1),
  liveCheck: envs.length,
}, null, 2))
