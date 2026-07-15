#!/usr/bin/env node
// Tram serializer + require runtime — makes an EXECUTABLE bundle, not just concatenated
// code. This is the piece that was missing: a module system.
//
//   - resolve the module graph from an entry (relative specifiers + extensions)
//   - transform each module to CommonJS (babel)
//   - assign numeric ids, build per-module dependency maps
//   - wrap each in __d(factory, id, depMap) and prepend a Metro-style __d/__r runtime
//   - append __r(entryId)
//
// Verified by bundling a real multi-module graph and EXECUTING it.
//
// Usage: node src/serializer.mjs <entryFile>   (or run with no args for the self-test)

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const TOOLCHAIN_PROJECT = '/Users/sanketsahu/projects/tram/bench/expo-app'
const require = createRequire(TOOLCHAIN_PROJECT + '/')
const babel = require('@babel/core')

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']

// minimal resolver: relative specifier -> absolute file (+ extension / index)
function resolve(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null // bare import (vendor) — out of scope for this graph test
  const base = path.resolve(path.dirname(fromFile), spec)
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, 'index' + e))]
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  return null
}

function transformCJS(file) {
  const src = fs.readFileSync(file, 'utf8')
  const res = babel.transformSync(src, {
    filename: file, babelrc: false, configFile: false,
    presets: [require.resolve('@babel/preset-typescript')],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  return res.code
}

// BFS the graph from entry; assign ids; collect per-module dep maps
function buildGraph(entry) {
  const ids = new Map()
  const modules = []
  const idOf = (f) => { if (!ids.has(f)) { ids.set(f, ids.size); modules.push(null) } return ids.get(f) }
  const queue = [entry]
  idOf(entry)
  while (queue.length) {
    const file = queue.shift()
    const id = ids.get(file)
    const code = transformCJS(file)
    const depMap = {}
    // find require('...') specifiers
    for (const m of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1]
      if (spec in depMap) continue
      const resolved = resolve(file, spec)
      if (resolved == null) continue // bare/vendor — left to the vendor image in the real thing
      if (!ids.has(resolved)) queue.push(resolved)
      depMap[spec] = idOf(resolved)
    }
    modules[id] = { file, code, depMap }
  }
  return modules
}

const RUNTIME = `
var __mods = {}, __cache = {}, __deps = {};
function __d(factory, id, depMap) { __mods[id] = factory; __deps[id] = depMap; }
function __r(id) {
  if (__cache[id]) return __cache[id].exports;
  var module = { exports: {} }; __cache[id] = module;
  var require = function (name) {
    var target = __deps[id][name];
    if (target === undefined) throw new Error('unresolved require("' + name + '") in module ' + id);
    return __r(target);
  };
  __mods[id](globalThis, require, module, module.exports);
  return module.exports;
}
`.trim()

function serialize(modules, entryId) {
  const parts = [RUNTIME]
  for (let id = 0; id < modules.length; id++) {
    const { code, depMap } = modules[id]
    parts.push(`__d(function (global, require, module, exports) {\n${code}\n}, ${id}, ${JSON.stringify(depMap)});`)
  }
  parts.push(`__r(${entryId});`)
  return parts.join('\n\n')
}

export function bundle(entry) {
  const modules = buildGraph(entry)
  return { code: serialize(modules, 0), moduleCount: modules.length }
}

// ---- self-test: build a real graph and EXECUTE it -----------------------
if (process.argv[1] && process.argv[1].endsWith('serializer.mjs') && !process.argv[2]) {
  const dir = '/private/tmp/claude-501/-Users-sanketsahu-projects-tram/86802dfc-dbac-451f-816b-0a3f77deb0fb/scratchpad/graph'
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'util'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.ts'), `import { greet } from './greet';\nimport { NAME } from './const';\nglobalThis.__OUT = greet(NAME);`)
  fs.writeFileSync(path.join(dir, 'greet.ts'), `import { excl } from './util/excl';\nexport const greet = (n: string): string => excl('Hello ' + n);`)
  fs.writeFileSync(path.join(dir, 'const.ts'), `export const NAME = 'Tram';`)
  fs.writeFileSync(path.join(dir, 'util', 'excl.ts'), `export const excl = (s: string): string => s + '!';`)

  const { code, moduleCount } = bundle(path.join(dir, 'index.ts'))
  fs.writeFileSync(path.join(dir, 'bundle.js'), code)
  console.log(`serialized ${moduleCount} modules, ${code.length} bytes -> bundle.js`)

  // EXECUTE the bundle and check the module graph actually ran correctly
  globalThis.__OUT = undefined
  new Function(code)()
  const expected = 'Hello Tram!'
  console.log(`executed bundle -> __OUT = ${JSON.stringify(globalThis.__OUT)}`)
  console.log(globalThis.__OUT === expected ? `PASS: module graph resolved + executed correctly` : `FAIL: expected ${JSON.stringify(expected)}`)
  process.exit(globalThis.__OUT === expected ? 0 : 1)
}
