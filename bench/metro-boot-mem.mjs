#!/usr/bin/env node
// Isolated per-project WARM-BOOT memory: a FRESH process that only reads the packed
// vendor image and prepares to serve it. This is what a project actually pays to boot
// from the warm shared cache — NOT the one-time global cold-transform cost.

import fs from 'node:fs'

const PACKED = '/Users/sanketsahu/projects/tram/prototype/base-image-metro.pack'
const LOCAL_ROOT = '/Users/sanketsahu/projects/tram/bench/expo-app'
const MB = (b) => (b / 1048576).toFixed(1)

const rssStart = process.memoryUsage().rss
// warm boot: read the packed image, rehydrate the local root, ready to serve
const img = fs.readFileSync(PACKED, 'utf8')
const served = img.split('\0TRAM_ROOT\0').join(LOCAL_ROOT)
const rssReady = process.memoryUsage().rss

console.log(JSON.stringify({
  imageMB: +MB(fs.statSync(PACKED).size),
  rssStartMB: +MB(rssStart),        // node baseline (fresh process)
  rssReadyMB: +MB(rssReady),        // after loading + rehydrating the vendor image
  bootDeltaMB: +MB(rssReady - rssStart),
  servedBytes: served.length,
}, null, 2))
