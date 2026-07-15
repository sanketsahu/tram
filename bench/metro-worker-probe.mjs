// Probe metro-transform-worker: does it give us Metro-format module output
// (require -> dependencyMap index rewriting) + a dependencies list? That's the piece
// our plain-babel transform lacked.

import { createRequire } from 'node:module'
import fs from 'node:fs'

const APP = '/Users/sanketsahu/projects/jetplane/bench/expo-app'
const require = createRequire(APP + '/')
const { getDefaultConfig } = require('expo/metro-config')
const worker = require('metro-transform-worker')

const config = getDefaultConfig(APP)
const transformerConfig = config.transformer

const filename = `${APP}/node_modules/react-native/Libraries/Components/View/View.js`
const data = fs.readFileSync(filename)

const options = {
  dev: true,
  hot: false,
  inlinePlatform: true,
  minify: false,
  platform: 'ios',
  type: 'module',
  unstable_transformProfile: 'hermes-stable',
  customTransformOptions: { __proto__: null },
  experimentalImportSupport: false,
  unstable_disableES6Transforms: false,
  nonInlinedRequires: [],
  publicPath: '/assets',
}

const res = await worker.transform(transformerConfig, APP, filename, data, options)
const code = res.output[0].data.code
console.log('=== output type:', res.output[0].type)
console.log('=== code (first 900 chars) ===')
console.log(code.slice(0, 900))
console.log('\n=== dependencies (', res.dependencies.length, ') ===')
console.log(res.dependencies.slice(0, 12).map((d) => d.name).join('\n'))
console.log('\n=== has dependencyMap rewriting? ===')
console.log('  _dependencyMap refs:', (code.match(/dependencyMap/g) || []).length)
console.log('  __d wrapper present:', code.includes('__d(') || res.output[0].type)
