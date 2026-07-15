// Validate the custom transformer worker in isolation (no 2GB bundle):
//  1. transform a module -> valid Metro output, stored
//  2. transform again (same root) -> cache HIT, identical
//  3. transform as a DIFFERENT project root -> cache HIT (root-independent key),
//     result rehydrated to the new root

import { createRequire } from 'node:module'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const APP = '/Users/sanketsahu/projects/jetplane/bench/expo-app'
const require = createRequire(APP + '/')
const { getDefaultConfig } = require('expo/metro-config')
const jetplane = require('/Users/sanketsahu/projects/jetplane/src/jetplane-transformer.cjs')

const config = getDefaultConfig(APP).transformer
const options = { dev: true, hot: false, inlinePlatform: true, minify: false, platform: 'ios', type: 'module', unstable_transformProfile: 'hermes-stable', customTransformOptions: { __proto__: null }, experimentalImportSupport: false, publicPath: '/assets' }

execSync('rm -rf ~/.jetplane/tstore', { shell: '/bin/zsh' })
const count = () => { try { return execSync('find ~/.jetplane/tstore -type f | wc -l', { shell: '/bin/zsh' }).toString().trim() } catch { return '0' } }

const relFile = 'node_modules/react-native/Libraries/Components/View/View.js'
const src = fs.readFileSync(`${APP}/${relFile}`)

// 1) cold
const r1 = await jetplane.transform(config, APP, `${APP}/${relFile}`, src, options)
const code1 = r1.output[0].data.code
console.log('1) cold transform:')
console.log('   valid metro module:', code1.startsWith('__d(') && code1.includes('_dependencyMap'))
console.log('   dependencies:', r1.dependencies.length, '| store entries:', count())

// 2) warm, same root
const before = count()
const r2 = await jetplane.transform(config, APP, `${APP}/${relFile}`, src, options)
console.log('2) warm (same root): store grew?', count() !== before ? 'YES(bad)' : 'no', '| identical:', r2.output[0].data.code === code1)

// 3) DIFFERENT project root (cross-project) — must hit, rehydrate to root B
const ROOTB = '/Users/dev/checkouts/other-app'
const b4 = count()
const r3 = await jetplane.transform(config, ROOTB, `${ROOTB}/${relFile}`, src, options)
const code3 = r3.output[0].data.code
console.log('3) cross-project (root B):')
console.log('   store grew?', count() !== b4 ? 'YES(bad=no reuse)' : 'no (REUSED across projects)')
console.log('   result rehydrated to root B:', code3.includes(ROOTB) || !code1.includes(APP) ? 'ok' : 'check')
console.log('   structurally identical to A (modulo root):', code3.split(ROOTB).join('X') === code1.split(APP).join('X'))

const pass = code1.startsWith('__d(') && r2.output[0].data.code === code1 && count() === b4 && code3.split(ROOTB).join('X') === code1.split(APP).join('X')
console.log('\n' + (pass ? 'PASS: cross-project transform cache works inside Metro-format output' : 'CHECK results above'))
