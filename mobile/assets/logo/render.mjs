// Rasterize the logo SVGs to PNG at the sizes Expo needs.
// Run from the repo root (where playwright is installed):
//   node mobile/assets/logo/render.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// [source svg, output png, width, height?]. Height defaults to width.
const jobs = [
  ['icon.svg', '../icon.png', 1024],
  ['icon.svg', '../../ios/ClubPing/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png', 1024],
  ['adaptive-icon.svg', '../adaptive-icon.png', 1024],
  // Splash matches the login photo's native aspect (1600x1067) so cover-mode
  // crops sides on portrait devices but keeps the paddle/ball centered.
  ['splash-icon.svg', '../splash-icon.png', 1600, 1067],
  // Google Play listing asset (#356) — Play requires exactly 1024x500.
  ['feature-graphic.svg', '../store/feature-graphic.png', 1024, 500],
]

// Embed the welcome photo so the SVGs can reference it via {{PHOTO}} without
// depending on a baseURL when Playwright calls setContent().
const photoBuf = readFileSync(join(here, '..', 'welcome-bg.jpg'))
const photoDataUri = `data:image/jpeg;base64,${photoBuf.toString('base64')}`

const browser = await chromium.launch()
for (const [src, out, width, height = width] of jobs) {
  const svg = readFileSync(join(here, src), 'utf8').replaceAll('{{PHOTO}}', photoDataUri)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><meta charset=utf8><style>*{margin:0;padding:0}html,body{width:${width}px;height:${height}px;overflow:hidden}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
    { waitUntil: 'networkidle' },
  )
  const el = await page.$('svg')
  const buf = await el.screenshot({ omitBackground: true })
  writeFileSync(join(here, out), buf)
  await page.close()
  console.log('wrote', out)
}
await browser.close()
