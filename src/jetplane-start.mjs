// `jetplane start` — one command for the thin dev server.
//
//   1. ensure the transform-cache plugin is wired into metro.config.js
//   2. ensure dependencies are installed
//   3. ensure a device-bootable bundle exists for this lockfile (build once via Metro)
//   4. serve it from the thin, no-Metro server (Bun) + print a QR
//
// The thin server + build step are experimental and need Bun; the plugin step alone works
// on plain Node (that's what `jetplane init` does).

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = os.homedir()
const log = (m) => console.log(`jetplane: ${m}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const has = (cmd) => { try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true } catch { return false } }

const DEFAULT_CONFIG = `const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// jetplane wraps whatever transformer is already configured (here Expo's default) so its
// behavior is preserved — jetplane only adds a cross-project cache around it.
config.transformer.upstreamTransformerPath = config.transformerPath;
config.transformerPath = require.resolve('jetplane/transformer');
config.cacheStores = [];

module.exports = config;
`

// The wiring appended before module.exports. Binds the FINAL exported config to a temp
// first, so it works whether the export is a bare identifier (module.exports = config)
// or a call that builds the final config (module.exports = withNativeWind(config, ...)).
// Capturing the existing transformerPath as the upstream is what keeps NativeWind's .css
// handling (and Expo's asset worker) working — jetplane delegates to it.
function wiringBlock(expr) {
  return `const __jetplaneConfig = ${expr};
__jetplaneConfig.transformer = __jetplaneConfig.transformer || {};
__jetplaneConfig.transformer.upstreamTransformerPath = __jetplaneConfig.transformerPath;
__jetplaneConfig.transformerPath = require.resolve('jetplane/transformer');
__jetplaneConfig.cacheStores = [];
module.exports = __jetplaneConfig;
`
}

// 1. ensure metro.config.js wires in the plugin
export function ensureConfig(dir) {
  const cfg = path.join(dir, 'metro.config.js')
  if (!fs.existsSync(cfg)) { fs.writeFileSync(cfg, DEFAULT_CONFIG); log('created metro.config.js with the jetplane plugin'); return }
  let s = fs.readFileSync(cfg, 'utf8')
  if (s.includes('jetplane/transformer')) { log('plugin already in metro.config.js'); return }
  const idx = s.lastIndexOf('module.exports')
  const eq = idx > -1 ? s.indexOf('=', idx) : -1
  if (eq > -1) {
    let expr = s.slice(eq + 1).trim()
    // strip a trailing semicolon + any trailing whitespace/newlines on the statement
    if (expr.endsWith(';')) expr = expr.slice(0, -1).trim()
    s = s.slice(0, idx) + wiringBlock(expr)
    fs.writeFileSync(cfg, s)
    log('added the jetplane plugin to metro.config.js')
  } else {
    log("could not auto-edit metro.config.js — before module.exports add:\n  config.transformer.upstreamTransformerPath = config.transformerPath;\n  config.transformerPath = require.resolve('jetplane/transformer');\n  config.cacheStores = [];")
  }
}

// 2. ensure deps
function ensureInstalled(dir) {
  if (fs.existsSync(path.join(dir, 'node_modules'))) return
  const inst = has('bun') ? 'bun install' : has('pnpm') ? 'pnpm install' : 'npm install'
  log(`installing dependencies (${inst.split(' ')[0]})...`)
  execSync(inst, { cwd: dir, stdio: 'inherit' })
}

function lockHash(dir) {
  for (const f of ['bun.lock', 'bun.lockb', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']) {
    const p = path.join(dir, f)
    if (fs.existsSync(p)) return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return crypto.createHash('sha256').update(Object.keys(deps).sort().map((k) => k + deps[k]).join()).digest('hex').slice(0, 16)
  } catch { return crypto.createHash('sha256').update(dir).digest('hex').slice(0, 16) }
}

async function get(url, ms, headers = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal, headers }); return { ok: r.ok, body: await r.text() } }
  catch { return { ok: false, body: '' } } finally { clearTimeout(t) }
}

// 3. build the device-bootable bundle by capturing it from Metro once (cached per lockHash)
async function ensureBundle(dir, platform = 'ios') {
  const imageDir = path.join(HOME, '.jetplane', 'images', lockHash(dir))
  const complete = ['main.ios.bundle', 'manifest-multipart.bin', 'index.html', 'main.web.bundle']
  if (complete.every((f) => fs.existsSync(path.join(imageDir, f)))) {
    log(`bundle cached (${path.relative(HOME, imageDir)})`); return imageDir
  }
  fs.mkdirSync(imageDir, { recursive: true })
  log('building bundle (running Metro once — this is the one-time build)...')
  const port = 8099
  try { execSync(`lsof -tiTCP:${port} -sTCP:LISTEN | xargs kill -9`, { stdio: 'ignore' }) } catch {}
  const metro = spawn('npx', ['expo', 'start', '--port', String(port)], { cwd: dir, env: { ...process.env, CI: '1' }, detached: true, stdio: 'ignore' })
  const kill = () => { try { process.kill(-metro.pid, 'SIGKILL') } catch {} }
  try {
    const base = `http://localhost:${port}/`
    const dl = Date.now() + 180000
    let up = false
    while (Date.now() < dl) { const r = await get(base + 'status', 2000); if (r.ok && r.body.includes('running')) { up = true; break } await sleep(500) }
    if (!up) throw new Error('Metro did not start')
    const json = (await get(base, 20000, { 'expo-platform': platform, Accept: 'application/expo+json,application/json' })).body
    fs.writeFileSync(path.join(imageDir, 'manifest.json'), json)
    const multi = (await get(base, 20000, { 'expo-platform': platform, 'expo-protocol-version': '1', Accept: 'multipart/mixed,application/expo+json,application/json' })).body
    fs.writeFileSync(path.join(imageDir, 'manifest-multipart.bin'), multi)
    const url = JSON.parse(json).launchAsset.url
    log('bundling (first build may take a moment)...')
    const bundle = await get(url, 180000)
    if (!bundle.ok) throw new Error('bundle request failed')
    fs.writeFileSync(path.join(imageDir, `main.${platform}.bundle`), bundle.body)
    log(`native bundle built -> ${path.relative(HOME, imageDir)}`)

    // web: capture the HTML shell + a self-contained (lazy=false) web bundle, so the
    // thin server can serve the browser target the same way it serves the device.
    try {
      const html = (await get(base, 30000, { Accept: 'text/html' })).body
      const m = html && html.match(/<script[^>]*src="([^"]*\.bundle[^"]*)"/)
      if (m) {
        let webUrl = m[1].replace(/([?&])lazy=true/, '$1lazy=false')
        if (!/[?&]lazy=/.test(webUrl)) webUrl += (webUrl.includes('?') ? '&' : '?') + 'lazy=false'
        const abs = webUrl.startsWith('http') ? webUrl : base.replace(/\/$/, '') + webUrl
        log('building web bundle...')
        const web = await get(abs, 180000)
        if (web.ok) {
          fs.writeFileSync(path.join(imageDir, 'index.html'), html.replace(m[1], '/jetplane-web.bundle'))
          fs.writeFileSync(path.join(imageDir, 'main.web.bundle'), web.body)
          log('web bundle + html captured')
        } else log('web capture skipped (bundle request failed)')
      } else log('web capture skipped (no web entry in HTML — is react-native-web installed?)')
    } catch (e) { log(`web capture skipped (${e.message})`) }

    return imageDir
  } finally { kill(); await sleep(500) }
}

// 4. serve it from the thin server (Bun)
function serveThin(dir, port, imageDir) {
  if (!has('bun')) { console.error('jetplane: the thin server needs Bun — install it from https://bun.sh, then re-run.'); process.exit(1) }
  const thin = path.join(HERE, 'jetplane-serve-thin.ts')
  const child = spawn('bun', [thin, dir, String(port), imageDir], { stdio: 'inherit' })
  child.on('exit', (c) => process.exit(c ?? 0))
}

// `jetplane serve` — thin server only. Assumes the project is already set up (plugin
// wired, deps installed); builds the bundle if it's missing, then serves it.
export async function serve({ dir = process.cwd(), port = 8091 } = {}) {
  log(`serving ${dir}`)
  const imageDir = await ensureBundle(dir)
  serveThin(dir, port, imageDir)
}

// `jetplane dev` (alias `start`) — the unified one-liner for a fresh project:
// wire the plugin, install deps, build the bundle once, then serve it.
export async function start({ dir = process.cwd(), port = 8091 } = {}) {
  log(`starting in ${dir}`)
  ensureConfig(dir)
  ensureInstalled(dir)
  const imageDir = await ensureBundle(dir)
  serveThin(dir, port, imageDir)
}
