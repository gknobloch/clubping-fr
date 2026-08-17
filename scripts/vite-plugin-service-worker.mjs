import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.join(here, 'service-worker.js')

/**
 * Files from `public/` worth having offline. The document and the hashed
 * assets come from the bundle; these do not pass through it, so they are named
 * here. Icons matter more than they look: an installed app that boots offline
 * to a blank icon reads as broken.
 */
const PUBLIC_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

/**
 * Emits `sw.js` with this build's file names baked in (#387).
 *
 * Only the shell is precached: the document, the CSS, and the JS the entry
 * needs to start. Dynamically imported chunks are left out — pdf.js and
 * tesseract.js alone are ~2.6 MB, they serve one admin import flow on a
 * desktop, and making a phone in a car park download them to be "offline
 * ready" would be a poor trade. They are cached if and when they are used.
 */
export function serviceWorker() {
  return {
    name: 'clubping-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const fromBundle = Object.values(bundle)
        .filter((file) =>
          file.type === 'chunk'
            ? // Static graph only: a dynamic entry is by definition something
              // the app can start without.
              !file.isDynamicEntry
            : file.fileName.endsWith('.css'),
        )
        .map((file) => `/${file.fileName}`)

      const precache = [...new Set(['/index.html', ...fromBundle, ...PUBLIC_ASSETS])].sort()

      // Derived from the file list, so an unchanged build produces an
      // unchanged worker and browsers are not told to update for nothing.
      const buildId = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)

      const source = readFileSync(SOURCE, 'utf8')
        .replace('__BUILD_ID__', buildId)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
