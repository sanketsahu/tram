/**
 * Regenerate all brand assets from the SINGLE SOURCE OF TRUTH: the `LOGO_SVG`
 * string in components/logo.tsx.
 *
 *   app/icon.svg            — favicon (Next serves it automatically)
 *   public/logo.svg         — standalone logo file
 *   app/apple-icon.png      — 180×180 touch icon (sharp raster of the mark on a badge)
 *   app/opengraph-image.png — 1200×630 OG/Twitter card, screenshotted in a real browser
 *
 * The OG card is a plain HTML page (Geist fonts inlined) screenshotted at 1200×630 @2x
 * in Chromium — real-browser typography, like the reference. Uses a system Chrome via
 * CHROME_PATH, or Playwright's bundled Chromium.
 *
 * Run:  npm run assets      (CHROME_PATH is auto-detected on macOS)
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// --- single source of truth: extract LOGO_SVG from components/logo.tsx ---------------
const logoModule = await readFile(join(ROOT, 'components', 'logo.tsx'), 'utf8')
const LOGO_SVG = logoModule.match(/LOGO_SVG = `([\s\S]*?)`/)?.[1]
if (!LOGO_SVG) throw new Error('could not extract LOGO_SVG from components/logo.tsx')

// --- 1. favicon + standalone logo -----------------------------------------------------
await writeFile(join(ROOT, 'app', 'icon.svg'), LOGO_SVG.trim() + '\n')
await writeFile(join(ROOT, 'public', 'logo.svg'), LOGO_SVG.trim() + '\n')
console.log('wrote app/icon.svg, public/logo.svg')

// --- 2. apple touch icon: the badge mark itself, rasterized at 180×180 with sharp -----
const appleSvg = LOGO_SVG.replace('width="32" height="32"', 'width="180" height="180"')
await sharp(Buffer.from(appleSvg)).png().toFile(join(ROOT, 'app', 'apple-icon.png'))
console.log('wrote app/apple-icon.png')

// --- 3. OG card (1200×630) via real-browser screenshot --------------------------------
const font = async (f) => (await readFile(join(HERE, 'og-image', 'fonts', f))).toString('base64')
const [g400, g700, mono] = await Promise.all([font('Geist-400.woff'), font('Geist-700.woff'), font('GeistMono-400.woff')])

const ogLogo = LOGO_SVG.replace('width="32" height="32"', 'width="120" height="120"')

const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
  @font-face { font-family:'Geist'; font-weight:400; src:url(data:font/woff;base64,${g400}) format('woff'); }
  @font-face { font-family:'Geist'; font-weight:700; src:url(data:font/woff;base64,${g700}) format('woff'); }
  @font-face { font-family:'Geist Mono'; font-weight:400; src:url(data:font/woff;base64,${mono}) format('woff'); }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; }
  .card {
    width:1200px; height:630px; display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:0 90px; background-color:#09090b;
    background-image: radial-gradient(ellipse 90% 70% at 50% 0%, rgba(37,99,235,0.20), transparent 62%);
    color:#fafafa; font-family:'Geist',sans-serif; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision;
  }
  .logo { margin-bottom:36px; filter: drop-shadow(0 8px 30px rgba(59,130,246,0.30)); }
  .wordmark { font-weight:700; font-size:40px; letter-spacing:-1px; margin-bottom:26px; color:#e4e4e7; }
  h1 { font-weight:700; font-size:60px; line-height:1.12; letter-spacing:-2.2px; text-align:center; max-width:1000px; text-wrap:balance; }
  h1 .hl { color:#60a5fa; }
  p { margin-top:28px; font-weight:400; font-size:26px; line-height:1.4; color:#a1a1aa; text-align:center; max-width:860px; letter-spacing:-0.2px; }
  .cli { margin-top:44px; padding:14px 28px; border-radius:12px; border:1px solid #27272a; background-color:#161618;
    font-family:'Geist Mono',monospace; font-size:26px; color:#60a5fa; letter-spacing:-0.5px; }
  .cli .prompt { color:#52525b; }
</style></head><body>
  <div class="card">
    <span class="logo">${ogLogo}</span>
    <div class="wordmark">jetplane</div>
    <h1>Run dozens of Expo dev servers <span class="hl">on one machine</span></h1>
    <p>A cross-project transform cache and a thin, no-Metro dev server — ~40 MB per environment, live HMR included.</p>
    <div class="cli"><span class="prompt">$</span> jetplane dev</div>
  </div>
</body></html>`

const CHROME = process.env.CHROME_PATH ||
  (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined)

const { chromium } = await import('playwright-core').catch(() => import('playwright'))
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: join(ROOT, 'app', 'opengraph-image.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
console.log('wrote app/opengraph-image.png')
