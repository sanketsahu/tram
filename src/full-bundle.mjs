#!/usr/bin/env node
// Stable content-addressed IDs + app/vendor boundary.
//
// Module id = content hash of the (normalized) transformed code. This makes vendor
// modules' ids IDENTICAL across projects/roots -> the pre-built vendor image is
// shareable, and app modules reference vendor modules by the same stable id.
//
// Proves: (1) a bundle spanning app + node_modules executes; (2) the vendor portion is
// byte-identical when built from two different roots (shareable image).

import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOLCHAIN_PROJECT = process.env.TRAM_PROJECT || path.join(REPO, 'bench', 'expo-app')
const require = createRequire(TOOLCHAIN_PROJECT + '/')
const babel = require('@babel/core')
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

function fileExists(p) { return fs.existsSync(p) && fs.statSync(p).isFile() }
function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, 'index' + e))]) if (fileExists(c)) return c
  return null
}
function resolveBare(fromFile, spec) {
  // walk up looking for node_modules/<spec>
  const parts = spec.split('/')
  const pkg = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  const sub = spec.slice(pkg.length + 1)
  let dir = path.dirname(fromFile)
  while (true) {
    const pkgDir = path.join(dir, 'node_modules', pkg)
    if (fs.existsSync(pkgDir)) {
      if (sub) return resolveRelative(path.join(pkgDir, 'x'), './' + sub)
      let main = 'index.js'
      try { main = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).main || 'index.js' } catch {}
      return resolveRelative(path.join(pkgDir, 'x'), './' + main)
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
const resolve = (fromFile, spec) => (spec.startsWith('.') || spec.startsWith('/')) ? resolveRelative(fromFile, spec) : resolveBare(fromFile, spec)

function transformCJS(file, projectRoot) {
  const src = fs.readFileSync(file, 'utf8')
  const res = babel.transformSync(src, {
    filename: file, babelrc: false, configFile: false,
    presets: [require.resolve('@babel/preset-typescript')],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  // normalize any baked project root so the content hash is root-independent
  return res.code.split(projectRoot).join('\0ROOT\0')
}

// returns { modules: [{id, code, depMap, vendor}], entryId }
function buildGraph(entry, projectRoot) {
  const byFile = new Map()
  const modules = []
  const queue = [entry]
  const enqueued = new Set([entry])
  while (queue.length) {
    const file = queue.shift()
    const code = transformCJS(file, projectRoot)
    const id = sha(code)
    const depMap = {}
    for (const m of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1]
      if (spec in depMap) continue
      const resolved = resolve(file, spec)
      if (!resolved) continue
      depMap[spec] = resolved // temp: file path; fix to id after all hashed
      if (!enqueued.has(resolved)) { enqueued.add(resolved); queue.push(resolved) }
    }
    const rec = { file, code, id, depMap, vendor: file.includes('/node_modules/') }
    byFile.set(file, rec)
    modules.push(rec)
  }
  // second pass: map depMap specifiers to resolved module ids
  for (const rec of modules) for (const spec of Object.keys(rec.depMap)) rec.depMap[spec] = byFile.get(rec.depMap[spec]).id
  return { modules, entryId: byFile.get(entry).id }
}

const RUNTIME = `
var __mods={},__cache={},__deps={};
function __d(f,id,dm){__mods[id]=f;__deps[id]=dm;}
function __r(id){if(__cache[id])return __cache[id].exports;var module={exports:{}};__cache[id]=module;
var require=function(n){var t=__deps[id][n];if(t===undefined)throw new Error('unresolved '+n+' in '+id);return __r(t);};
__mods[id](globalThis,require,module,module.exports);return module.exports;}`.trim()

function emitModule(rec, root) {
  const code = rec.code.split('\0ROOT\0').join(root) // rehydrate local root
  return `__d(function(global,require,module,exports){\n${code}\n}, ${JSON.stringify(rec.id)}, ${JSON.stringify(rec.depMap)});`
}

// ---- test: app + node_modules, two roots ---------------------------------
function scaffold(root) {
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(path.join(root, 'app'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules', 'mylib'), { recursive: true })
  fs.writeFileSync(path.join(root, 'app', 'index.ts'), `import { banner } from './banner';\nimport { upper } from 'mylib';\nglobalThis.__OUT = banner(upper('jetplane'));`)
  fs.writeFileSync(path.join(root, 'app', 'banner.ts'), `export const banner = (s: string): string => '[' + s + ']';`)
  fs.writeFileSync(path.join(root, 'node_modules', 'mylib', 'package.json'), JSON.stringify({ name: 'mylib', main: 'index.js' }))
  fs.writeFileSync(path.join(root, 'node_modules', 'mylib', 'index.js'), `const { shout } = require('./shout');\nexports.upper = (s) => shout(s.toUpperCase());`)
  fs.writeFileSync(path.join(root, 'node_modules', 'mylib', 'shout.js'), `exports.shout = (s) => s + '!!!';`)
}

const SB = path.join(os.tmpdir(), 'jetplane-fullbundle')
const rootA = path.join(SB, 'projA')
const rootB = path.join(SB, 'projB2')
scaffold(rootA); scaffold(rootB)

const A = buildGraph(path.join(rootA, 'app', 'index.ts'), rootA)
const B = buildGraph(path.join(rootB, 'app', 'index.ts'), rootB)

// vendor image = vendor modules only (normalized form), compared across roots
const vendorImg = (g) => g.modules.filter((m) => m.vendor).map((m) => `__d(...,${JSON.stringify(m.id)},${JSON.stringify(m.depMap)}):${m.code}`).sort().join('\n')
const vendorIdentical = vendorImg(A) === vendorImg(B)
const vendorIds = A.modules.filter((m) => m.vendor).map((m) => m.id).sort()
const vendorIdsB = B.modules.filter((m) => m.vendor).map((m) => m.id).sort()

console.log(`graph A: ${A.modules.length} modules (${A.modules.filter(m => m.vendor).length} vendor)`)
console.log(`vendor ids A: ${JSON.stringify(vendorIds)}`)
console.log(`vendor ids B: ${JSON.stringify(vendorIdsB)}`)
console.log(`vendor image byte-identical across roots: ${vendorIdentical}`)

// assemble full bundle for root A and EXECUTE
const bundle = [RUNTIME, ...A.modules.map((m) => emitModule(m, rootA)), `__r(${JSON.stringify(A.entryId)});`].join('\n\n')
globalThis.__OUT = undefined
new Function(bundle)()
const expected = '[TRAM!!!]'
console.log(`executed app+vendor bundle -> __OUT = ${JSON.stringify(globalThis.__OUT)}`)
const pass = globalThis.__OUT === expected && vendorIdentical && JSON.stringify(vendorIds) === JSON.stringify(vendorIdsB)
console.log(pass ? 'PASS: cross-boundary execution + stable shareable vendor image' : 'FAIL')
process.exit(pass ? 0 : 1)
