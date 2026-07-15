#!/usr/bin/env node
// Tally the transform worker's hit/miss telemetry.
//   node src/tram-stats.mjs          -> print hits/misses/rate
//   node src/tram-stats.mjs reset    -> clear before a fresh bundle
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const F = path.join(os.homedir(), '.tram', 'stats.log')
if (process.argv[2] === 'reset') { fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, ''); console.log('tram stats reset'); process.exit(0) }

const s = fs.existsSync(F) ? fs.readFileSync(F, 'utf8') : ''
const h = (s.match(/H/g) || []).length
const m = (s.match(/M/g) || []).length
const t = h + m
console.log(`transforms: ${t}  |  cache HITS: ${h}  |  misses: ${m}  |  hit-rate: ${t ? (100 * h / t).toFixed(1) : 0}%`)
