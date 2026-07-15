#!/usr/bin/env node
// Gate experiment: are Metro/Expo vendor transforms content-addressable across two
// different PROJECT ROOTS? Transform the same vendor source with babel-preset-expo,
// once as if it lived under rootA, once under rootB, and diff.
//
// If the only differences are the absolute root path (which we can normalize), then a
// cross-project content-addressed cache is viable. If transforms differ structurally,
// it is not (without deeper work).

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const APP = '/Users/sanketsahu/projects/jetplane/bench/expo-app'
const ROOT_A = '/Users/sanketsahu/projects/jetplane/bench/expo-app'
// a REAL second checkout path (some plugins, e.g. reanimated worklets, read the file
// from disk at `filename`, so root B must actually exist)
const ROOT_B = '/private/tmp/claude-501/-Users-sanketsahu-projects-jetplane/86802dfc-dbac-451f-816b-0a3f77deb0fb/scratchpad/rootB'

const require = createRequire(APP + '/')
const babel = require('@babel/core')
const PRESET = require.resolve('babel-preset-expo')

const FILES = [
  'node_modules/react-native-reanimated/src/animation/clamp.ts',
  'node_modules/react-native/Libraries/Components/View/View.js',
  'node_modules/expo-router/build/Route.js',
]

function transformAsRoot(relPath, root) {
  const src = fs.readFileSync(path.join(APP, relPath), 'utf8')
  const filename = path.join(root, relPath)
  // materialize the file at this root so disk-reading plugins (reanimated) work
  if (root !== APP) { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, src) }
  const res = babel.transformSync(src, {
    filename,
    root: '/',        // so a filename under any checkout path is "inside" root
    cwd: APP,         // resolve nested plugins from the real project
    babelrc: false,
    configFile: false,
    presets: [[PRESET, { native: {} }]],
    caller: { name: 'metro', platform: 'ios', isDev: true, isServer: false },
  })
  return res.code
}

const normalize = (code) => code.split(ROOT_A).join('<ROOT>').split(ROOT_B).join('<ROOT>')

console.log('file'.padEnd(52), 'identical', 'norm-identical', 'rootA-hits', 'rootB-hits')
for (const rel of FILES) {
  let a, b, err = null
  try { a = transformAsRoot(rel, ROOT_A); b = transformAsRoot(rel, ROOT_B) }
  catch (e) { err = e.message.split('\n')[0] }
  if (err) { console.log(rel.replace('node_modules/', '').padEnd(52), 'ERROR:', err); continue }
  const identical = a === b
  const normIdentical = normalize(a) === normalize(b)
  const aHits = (a.match(new RegExp(ROOT_A.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  const bHits = (b.match(new RegExp(ROOT_B.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  console.log(
    rel.replace('node_modules/', '').padEnd(52),
    String(identical).padEnd(9), String(normIdentical).padEnd(14), String(aHits).padEnd(10), String(bHits)
  )
  if (!identical && !normIdentical) {
    // show a hint of the first structural difference
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) { console.log('    first non-path diff @', i, ':\n     A:', JSON.stringify(a.slice(i, i + 80)), '\n     B:', JSON.stringify(b.slice(i, i + 80))); break }
    }
  }
}
