// Rasterize the web app icons (PWA manifest + iOS home screen) to PNG.
// Run from the repo root (where playwright is installed):
//   node scripts/render-web-icons.mjs
//
// The source is mobile/assets/logo/icon.svg — the same slate tile the native
// app ships — so a Club Ping icon on a home screen looks identical whether it
// came from the App Store build or from "Ajouter à l'écran d'accueil".
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'mobile/assets/logo/icon.svg'), 'utf8')

// The tile colour, repeated behind a shrunken tile so `scale` < 1 stays
// full-bleed instead of showing through. Keep in sync with icon.svg's <rect>.
const TILE = '#1e293b'

// [output png, size, scale]. `scale` shrinks the tile inside the canvas:
//   1     — icon.svg as drawn; the mark fills ~82%, sized for iOS' rounded mask
//   0.78  — maskable: keeps every handle tip inside Android's 80% safe circle,
//           which crops to a circle on some launchers
const jobs = [
  ['public/icons/icon-192.png', 192, 1],
  ['public/icons/icon-512.png', 512, 1],
  ['public/icons/icon-maskable-512.png', 512, 0.78],
  ['public/apple-touch-icon.png', 180, 1],
]

mkdirSync(join(root, 'public/icons'), { recursive: true })

// Sandboxed CI images sometimes ship a Chromium that predates the build
// playwright expects; point at it rather than downloading a second copy.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})
for (const [out, size, scale] of jobs) {
  const inner = Math.round(size * scale)
  const offset = Math.round((size - inner) / 2)
  // Nest icon.svg (viewBox 0 0 1024 1024) inside the canvas; the outer rect
  // covers the margin left by `scale`. Its own width/height must go first —
  // a duplicate attribute keeps the *earlier* value, so leaving them in place
  // would render the tile at its natural 1024px and crop it.
  const nested = source.replace(
    /<svg([^>]*)>/,
    (_, attrs) =>
      `<svg${attrs.replace(/\s(?:width|height|xmlns)="[^"]*"/g, '')}` +
      ` x="${offset}" y="${offset}" width="${inner}" height="${inner}">`,
  )
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" fill="${TILE}"/>${nested}</svg>`

  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><meta charset=utf8><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden}svg{display:block}</style>${svg}`,
    { waitUntil: 'networkidle' },
  )
  const buf = await page.locator('svg').first().screenshot()
  writeFileSync(join(root, out), buf)
  await page.close()
  console.log('wrote', out)
}
await browser.close()
