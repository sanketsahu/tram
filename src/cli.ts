#!/usr/bin/env bun
// jetplane — one entrypoint for install + dev, backed by a shared content-addressed cache.
//
//   jetplane dev [dir] [--port N]     detect framework, ensure deps, run cache-backed dev
//   jetplane detect [dir]             print detected framework
//
// No daemon. Each run is its own process; sharing is via ~/.jetplane on disk.

import path from 'node:path'
import { detectFramework, ensureInstalled, lockHash } from './core.ts'
import { runViteDev } from './adapters/vite.ts'
import { runExpoDev } from './adapters/expo.ts'

const log = (s: string) => console.log(s)

function parseArgs(argv: string[]) {
  const args = { _: [] as string[], port: 5173 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') args.port = parseInt(argv[++i], 10)
    else if (a.startsWith('--port=')) args.port = parseInt(a.split('=')[1], 10)
    else args._.push(a)
  }
  return args
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  const args = parseArgs(rest)
  const dir = path.resolve(args._[0] || process.cwd())

  if (cmd === 'detect') {
    console.log(`framework: ${detectFramework(dir)}  lockHash: ${lockHash(dir)}`)
    return
  }

  if (cmd === 'dev' || cmd === undefined) {
    const fw = detectFramework(dir)
    log(`jetplane: ${dir}`)
    log(`jetplane: framework=${fw}`)
    ensureInstalled(dir, log)

    if (fw === 'vite') {
      const t0 = performance.now()
      const { url, close } = await runViteDev(dir, args.port, log)
      const ms = (performance.now() - t0).toFixed(0)
      log(`jetplane: dev server ready in ${ms} ms -> ${url}`)
      const shutdown = async () => { await close(); process.exit(0) }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
      return
    }

    if (fw === 'expo') {
      const t0 = performance.now()
      await runExpoDev(dir, args.port === 5173 ? 8081 : args.port, log)
      log(`jetplane: up in ${(performance.now() - t0).toFixed(0)} ms`)
      const shutdown = () => process.exit(0)
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
      return
    }

    if (fw === 'next') {
      log('jetplane: next adapter not implemented yet. Coming next.')
      process.exit(1)
    }

    log('jetplane: could not detect a supported framework (vite/expo/next).')
    process.exit(1)
  }

  console.log(`unknown command: ${cmd}\nusage: jetplane dev [dir] [--port N] | jetplane detect [dir]`)
  process.exit(1)
}

main().catch((e) => { console.error('jetplane: error\n', e); process.exit(1) })
