// HMR update generation for the thin server.
//
// The pre-built bundle carries `__d(factory, id, [deps], "path")` for every module, so we
// can recover path->id, id->deps, and (by inversion) id->inverseDeps WITHOUT running
// Metro. On an app-file edit we transform just that file (hot), wrap it as a Metro HMR
// module (id + deps + verboseName + inverseDependenciesById), and push it over /hot.

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

// Parse the bundle's __d defs -> maps. Format: },ID,[d,d,d],"path"
export function parseBundle(bundlePath) {
  const src = fs.readFileSync(bundlePath, 'utf8')
  const pathToId = new Map()
  const idToDeps = new Map()
  const idToInverse = new Map()
  const re = /\},(\d+),\[([\d,]*)\],"((?:[^"\\]|\\.)*)"/g
  let m
  while ((m = re.exec(src))) {
    const id = +m[1]
    const deps = m[2] ? m[2].split(',').map(Number) : []
    const p = m[3]
    pathToId.set(p, id)
    idToDeps.set(id, deps)
  }
  // invert
  for (const [id, deps] of idToDeps) for (const d of deps) {
    if (!idToInverse.has(d)) idToInverse.set(d, [])
    idToInverse.get(d).push(id)
  }
  return { pathToId, idToDeps, idToInverse, src }
}

// The transformed module references deps as require(_dependencyMap[N], "NAME"). To build
// a correct dependencyMap array we must map each NAME (in _dependencyMap order) to a
// module id. Existing deps resolve via the requesting module's own original name->id
// (recovered from the bundle); newly-added deps (e.g. babel helpers) resolve as bare
// package paths.
function reqNamesInOrder(code) {
  const arr = []
  for (const m of code.matchAll(/_dependencyMap\[(\d+)\],\s*"((?:[^"\\]|\\.)*)"/g)) arr[+m[1]] = m[2]
  return arr
}
function moduleRegion(src, id) {
  const marker = `,${id},[`
  const at = src.indexOf(marker)
  if (at < 0) return ''
  return src.slice(src.lastIndexOf('__d(', at), at)
}
// Build the dependencyMap id-array for a module's HOT-transformed code. Names present in
// the bundle resolve to their bundle id (via the requester's own name->id recovered from
// the bundle); names NOT in the bundle (new deps) are resolved on disk, and if still not
// in the bundle get a fresh id and are pushed to `newMods` to be sent as `added`.
function resolveDeps(maps, requesterFile, requesterId, hotCode, projectDir, newMods) {
  const req = createRequire(requesterFile)
  const nameToId = new Map()
  if (maps.idToDeps.has(requesterId)) {
    const rn = reqNamesInOrder(moduleRegion(maps.src, requesterId))
    const rd = maps.idToDeps.get(requesterId)
    rn.forEach((n, i) => { if (n != null && rd[i] != null) nameToId.set(n, rd[i]) })
  }
  const hotNames = reqNamesInOrder(hotCode)
  return hotNames.map((name) => {
    if (name == null) return 0
    if (nameToId.has(name)) return nameToId.get(name)
    let file
    try { file = req.resolve(name) } catch { throw new Error(`cannot resolve "${name}" from ${requesterFile}`) }
    const rel = path.relative(projectDir, file).split(path.sep).join('/')
    if (maps.pathToId.has(rel)) return maps.pathToId.get(rel)
    const nid = freshId(rel)
    if (!newMods.some((m) => m.id === nid)) newMods.push({ id: nid, file, rel })
    return nid
  })
}

// inverse-dependency closure above `startId`, as { id: [directInverseIds] }
function inverseClosure(startId, idToInverse) {
  const out = Object.create(null)
  const seen = new Set([startId])
  const q = [startId]
  while (q.length) {
    const n = q.shift()
    const inv = idToInverse.get(n) || []
    out[n] = inv
    for (const i of inv) if (!seen.has(i)) { seen.add(i); q.push(i) }
  }
  return out
}

// stable fresh ids for modules NOT in the pre-built bundle (e.g. babel helpers pulled in
// by the React Refresh transform). Persist across edits so re-edits reuse the same id.
const NEW_IDS = new Map()
let NEXT_ID = 9_000_000
function freshId(rel) { if (!NEW_IDS.has(rel)) NEW_IDS.set(rel, NEXT_ID++); return NEW_IDS.get(rel) }

// Build the HMR update for a changed file: { modified: [entry], added: [entries] }.
// `added` carries modules the hot transform pulled in that are NOT in the pre-built
// bundle (e.g. babel/React-Refresh helpers), each with a fresh id.
export async function makeUpdate(projectDir, absFile, maps, clientUrlBase) {
  const req = createRequire(projectDir + '/')
  const worker = req('metro-transform-worker')
  const { addParamsToDefineCall } = req('metro-transform-plugins')
  const { getDefaultConfig } = req('expo/metro-config')
  const transformerConfig = getDefaultConfig(projectDir).transformer

  // MUST match the options the original bundle was built with (reactCompiler, routerRoot,
  // engine) or the _dependencyMap indices won't line up with the bundle ids.
  const options = {
    dev: true, hot: true, inlinePlatform: true, minify: false, platform: 'ios',
    type: 'module', unstable_transformProfile: 'hermes-stable',
    customTransformOptions: { __proto__: null, engine: 'hermes', routerRoot: 'app', reactCompiler: 'true' },
    experimentalImportSupport: false, publicPath: '/assets',
  }
  const transform = (file) => worker.transform(transformerConfig, projectDir, file, fs.readFileSync(file), options)
  const urlFor = (rel) => `${clientUrlBase}/${rel.replace(/\.(t|j)sx?$/, '')}.bundle`

  // temp inverse graph so closures include the new module edges we add below
  const inv = new Map(maps.idToInverse)
  const addEdge = (childId, parentId) => inv.set(childId, [...(inv.get(childId) || []), parentId])

  const added = []
  const visited = new Set()
  // transform a module, resolve its deps (collecting new ones), recurse, emit entry
  const process = async (file, id, rel, isNew, parentId) => {
    if (visited.has(id)) return
    visited.add(id)
    if (isNew && parentId != null) addEdge(id, parentId)
    const r = await transform(file)
    const factory = r.output[0].data.code
    const newMods = []
    const deps = resolveDeps(maps, file, id, factory, projectDir, newMods)
    for (const nm of newMods) await process(nm.file, nm.id, nm.rel, true, id)
    let code = addParamsToDefineCall(factory, id, deps, rel, inverseClosure(id, inv))
    code += `\n//# sourceURL=${urlFor(rel)}\n`
    const entry = { module: [id, code], sourceURL: urlFor(rel) }
    if (isNew) added.push(entry)
    return entry
  }

  const rel = path.relative(projectDir, absFile).split(path.sep).join('/')
  const id = maps.pathToId.get(rel)
  if (id == null) throw new Error(`no module id for ${rel} (not in bundle)`)
  const modified = await process(absFile, id, rel, false, null)
  return { modified, added }
}

// self-test: parse the captured bundle, make an update for (tabs)/index.tsx
if (process.argv[1] && process.argv[1].endsWith('tram-hmr.mjs')) {
  const PROJECT = '/Users/sanketsahu/projects/tram/bench/expo-app-54'
  const BUNDLE = `${process.env.HOME}/.tram/images/expo54/main.ios.bundle`
  const maps = parseBundle(BUNDLE)
  console.log('parsed modules:', maps.pathToId.size)
  const rel = 'app/(tabs)/index.tsx'
  console.log(`${rel} -> id`, maps.pathToId.get(rel), '| deps', (maps.idToDeps.get(maps.pathToId.get(rel)) || []).length, '| inverse', (maps.idToInverse.get(maps.pathToId.get(rel)) || []).length)
  const u = await makeUpdate(PROJECT, `${PROJECT}/${rel}`, maps, 'http://localhost:8091')
  console.log('modified module id:', u.modified.module[0])
  console.log('modified starts with __d:', u.modified.module[1].startsWith('__d('))
  console.log('has RefreshReg (React Refresh):', u.modified.module[1].includes('RefreshReg') || u.modified.module[1].includes('$RefreshSig'))
  console.log('added modules:', u.added.map((a) => a.module[0]).join(', ') || '(none)')
  for (const a of u.added) {
    const relOfId = [...maps.pathToId.entries()].find(([, v]) => v === a.module[0])
    console.log('  added id', a.module[0], '-> fresh module (new dep), code starts __d:', a.module[1].startsWith('__d('))
  }
  console.log('modified dep tail:', JSON.stringify(u.modified.module[1].slice(-140)))
}
