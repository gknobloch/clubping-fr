/*
 * Service worker for the installed web app (#387, step 3).
 *
 * Without one, launching from the home screen with no network fails before any
 * of our code runs: the document itself never loads, so the offline banner and
 * the cached data added earlier in #387 are never reached. This makes the shell
 * survive that, which is the whole point of the issue — a line-up is read in a
 * sports hall, usually a basement.
 *
 * Built by scripts/vite-plugin-service-worker.mjs, which substitutes the two
 * placeholders below with the current build's hashed file names. Plain script,
 * not a module: module workers are still not everywhere, and there is nothing
 * here that needs imports.
 */
/* eslint-env serviceworker */

const BUILD_ID = '__BUILD_ID__'
/** The shell: the document, its stylesheet and the JS it statically needs. */
const PRECACHE = __PRECACHE__

/**
 * Versioned, so a deploy installs its shell into a fresh cache and drops the
 * previous one wholesale. That is what keeps the offline shell internally
 * consistent: the cached document and the hashed assets it points at always
 * come from the same build.
 */
const SHELL_CACHE = `clubping-shell-${BUILD_ID}`
/**
 * Not versioned. Holds the web fonts, which are stable across deploys and
 * would otherwise have to be refetched by a member who is already offline.
 */
const RUNTIME_CACHE = 'clubping-runtime'
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

/** The document served for any navigation we cannot fetch. */
const SHELL_DOCUMENT = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
  // Deliberately no skipWaiting: a new build takes over on the next launch
  // rather than swapping the code under someone who is part-way through
  // entering a line-up.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((n) => n.startsWith('clubping-shell-') && n !== SHELL_CACHE)
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  // The API is never cached here, on purpose. DataContext already keeps the
  // last response, keyed to the member and dropped at logout; a second copy
  // under the service worker would have no such key, outlive the session, and
  // hand one member's club to the next on a shared phone (#387).
  if (sameOrigin && url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
    return
  }

  if (sameOrigin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE))
  }
})

/**
 * Network first. Online, the member always gets the document the server has,
 * so a deploy is never held back by a cache; offline, they get the shell and
 * the app boots into its own cached data.
 *
 * The cached document is deliberately not refreshed here — only a new worker's
 * install replaces it, together with the assets it names.
 */
async function navigate(request) {
  try {
    return await fetch(request)
  } catch {
    const cached = await caches.match(SHELL_DOCUMENT, { cacheName: SHELL_CACHE, ignoreVary: true })
    if (cached) return cached
    // Nothing precached yet: let the browser show its own offline page rather
    // than a worker error, which says nothing to anyone.
    return Response.error()
  }
}

/** Hashed file names, so a hit is always current and a miss is worth keeping. */
async function cacheFirst(request, cacheName) {
  // ignoreVary matters more than it looks. Vite marks its module scripts
  // `crossorigin`, so the browser requests them with an `Origin` header, while
  // the copy put there at install time was requested without one. Servers that
  // answer `Vary: Origin` — the preview server does, and a CDN may — then make
  // every precached asset miss, and the app fails to start offline with a full
  // cache sitting right there. The URL is hashed; nothing else identifies it.
  const cached = await caches.match(request, { ignoreVary: true })
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(cacheName)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return Response.error()
  }
}
