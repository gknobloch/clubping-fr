import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Service worker (#387)
//
// It is the one piece of the app that runs with no React, no DOM and no test
// framework around it, and the one that can make the app unreachable if it
// gets its routing wrong. So it is loaded here as source and driven through a
// fake Cache Storage, which is the only way to assert what it does per request
// without a browser.
// ---------------------------------------------------------------------------

const SOURCE = path.join(__dirname, 'service-worker.js')
const ORIGIN = 'https://clubping.fr'

type Handler = (event: unknown) => void

function cacheStorage() {
  const stores = new Map<string, Map<string, unknown>>()
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)!
  }
  // The real Cache API resolves keys against the origin, so `addAll(['/x'])`
  // and a request for `https://origin/x` are one entry. A fake that keys on
  // the raw string would pass tests the browser would fail.
  const keyOf = (req: unknown) =>
    new URL(typeof req === 'string' ? req : (req as Request).url, ORIGIN).href
  // Entries carry the `Vary` the real one honours. This is not decoration: the
  // preview server answers `Vary: Origin`, Vite requests its module scripts
  // `crossorigin` so they carry an `Origin` the precached copy never had, and
  // without `ignoreVary` every asset missed and the app would not start offline
  // with a full cache in front of it. A fake that ignored Vary called that fine.
  const varies = (req: unknown, entry: { vary: boolean }) =>
    entry.vary && typeof req !== 'string' && (req as { origin?: string }).origin !== undefined
  const cache = (name: string) => ({
    addAll: async (urls: string[]) =>
      urls.forEach((u) => store(name).set(keyOf(u), { body: `precached:${u}`, vary: true })),
    put: async (req: unknown, res: unknown) =>
      void store(name).set(keyOf(req), { body: res, vary: false }),
    match: async (req: unknown, opts?: { ignoreVary?: boolean }) => {
      const entry = store(name).get(keyOf(req)) as { body: unknown; vary: boolean } | undefined
      if (!entry) return undefined
      if (!opts?.ignoreVary && varies(req, entry)) return undefined
      return entry.body
    },
  })
  return {
    stores,
    open: async (name: string) => cache(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: unknown, opts?: { cacheName?: string; ignoreVary?: boolean }) => {
      const key = keyOf(req)
      const names = opts?.cacheName ? [opts.cacheName] : [...stores.keys()]
      for (const name of names) {
        const entry = store(name).get(key) as { body: unknown; vary: boolean } | undefined
        if (!entry) continue
        if (!opts?.ignoreVary && varies(req, entry)) continue
        return entry.body
      }
      return undefined
    },
  }
}

/** A response that is enough for the worker: ok, cloneable, identifiable. */
const response = (body: string, ok = true) => ({
  ok,
  body,
  clone() {
    return this
  },
})

/**
 * `origin` stands for the `Origin` header the browser attaches to a
 * `crossorigin` request — the thing `Vary: Origin` keys on.
 */
function request(
  url: string,
  init: { method?: string; mode?: string; origin?: string } = {},
) {
  return { url, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors', ...(init.origin ? { origin: init.origin } : {}) }
}

/** Loads the worker with the build placeholders filled in, as the plugin does. */
function load(fetchImpl: ReturnType<typeof vi.fn>) {
  const handlers = new Map<string, Handler>()
  const caches = cacheStorage()
  const src = readFileSync(SOURCE, 'utf8')
    .replace('__BUILD_ID__', 'testbuild')
    .replace('__PRECACHE__', JSON.stringify(['/index.html', '/assets/app.js']))

  const self = {
    location: { origin: ORIGIN },
    clients: { claim: async () => {} },
    addEventListener: (type: string, handler: Handler) => void handlers.set(type, handler),
  }
  const Response = { error: () => response('network-error', false) }

  new Function('self', 'caches', 'fetch', 'Response', 'URL', src)(
    self,
    caches,
    fetchImpl,
    Response,
    URL,
  )

  const waits: Promise<unknown>[] = []
  return {
    caches,
    /** Runs a lifecycle event and settles whatever it kept alive. */
    async lifecycle(type: 'install' | 'activate') {
      handlers.get(type)!({ waitUntil: (p: Promise<unknown>) => void waits.push(p) })
      await Promise.all(waits)
    },
    /** Returns what the worker answered, or undefined if it did not answer. */
    async fetchEvent(req: ReturnType<typeof request>) {
      let answered: Promise<unknown> | undefined
      handlers.get('fetch')!({ request: req, respondWith: (p: Promise<unknown>) => (answered = p) })
      return answered === undefined ? undefined : await answered
    },
  }
}

describe('service worker (#387)', () => {
  let fetchImpl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchImpl = vi.fn(async (req: { url: string }) => response(`network:${req.url}`))
  })

  it('precaches the shell on install', async () => {
    const sw = load(fetchImpl)

    await sw.lifecycle('install')

    const shell = sw.caches.stores.get('clubping-shell-testbuild')!
    expect([...shell.keys()]).toEqual([`${ORIGIN}/index.html`, `${ORIGIN}/assets/app.js`])
  })

  // The reason the app can be launched from a home screen in a basement at all.
  it('serves the cached document when a navigation cannot reach the network', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'))

    const answer = await sw.fetchEvent(request(`${ORIGIN}/equipes/5`, { mode: 'navigate' }))

    expect(answer).toBe('precached:/index.html')
  })

  it('prefers the network for navigations, so a deploy is never held back', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')

    const answer = await sw.fetchEvent(request(`${ORIGIN}/`, { mode: 'navigate' }))

    expect((answer as { body: string }).body).toBe(`network:${ORIGIN}/`)
    // The cached document is replaced only by a new worker's install, together
    // with the assets it names. Refreshing it here would leave a cached
    // document pointing at hashed files this cache does not have.
    const shell = sw.caches.stores.get('clubping-shell-testbuild')!
    expect((shell.get(`${ORIGIN}/index.html`) as { body: string }).body).toBe('precached:/index.html')
  })

  // The rule that keeps one member's club off the next member's screen: the
  // API is DataContext's to cache, keyed to the member and dropped at logout.
  it('never touches the API', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')

    expect(await sw.fetchEvent(request(`${ORIGIN}/api/data`))).toBeUndefined()
    expect(await sw.fetchEvent(request(`${ORIGIN}/api/auth/me`))).toBeUndefined()
    expect(sw.caches.stores.get('clubping-shell-testbuild')!.has(`${ORIGIN}/api/data`)).toBe(false)
  })

  it('leaves writes alone', async () => {
    const sw = load(fetchImpl)

    expect(await sw.fetchEvent(request(`${ORIGIN}/assets/app.js`, { method: 'POST' }))).toBeUndefined()
  })

  it('answers a cached asset without asking the network', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')

    const answer = await sw.fetchEvent(request(`${ORIGIN}/assets/app.js`))

    expect(answer).toBe('precached:/assets/app.js')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // The bug that made the app fail to start offline with a full cache in front
  // of it: Vite's module scripts are `crossorigin`, so they arrive with an
  // `Origin` header the precached copy never had, and the preview server (like
  // a CDN) answers `Vary: Origin`.
  it('serves a crossorigin script from the precache despite Vary', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')

    const answer = await sw.fetchEvent(
      request(`${ORIGIN}/assets/app.js`, { mode: 'cors', origin: ORIGIN }),
    )

    expect(answer).toBe('precached:/assets/app.js')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps an asset it had to fetch, so the next launch has it', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')

    await sw.fetchEvent(request(`${ORIGIN}/assets/late.js`))

    const shell = sw.caches.stores.get('clubping-shell-testbuild')!
    expect(shell.has(`${ORIGIN}/assets/late.js`)).toBe(true)
  })

  it('does not keep a failed response', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')
    fetchImpl.mockResolvedValue(response('nope', false))

    await sw.fetchEvent(request(`${ORIGIN}/assets/missing.js`))

    expect(sw.caches.stores.get('clubping-shell-testbuild')!.has(`${ORIGIN}/assets/missing.js`)).toBe(false)
  })

  it('ignores other origins, which are none of its business', async () => {
    const sw = load(fetchImpl)

    expect(await sw.fetchEvent(request('https://example.invalid/thing.js'))).toBeUndefined()
  })

  // Fonts go to their own cache: they do not change between deploys, and a
  // member who is already offline cannot refetch what a deploy threw away.
  it('caches fonts apart from the shell, so a deploy does not drop them', async () => {
    const sw = load(fetchImpl)
    await sw.lifecycle('install')

    await sw.fetchEvent(request('https://fonts.gstatic.com/s/dmsans/font.woff2'))

    expect(sw.caches.stores.get('clubping-runtime')!.size).toBe(1)
    expect(sw.caches.stores.get('clubping-shell-testbuild')!.size).toBe(2)
  })

  it('drops the previous build’s shell on activate, and keeps the fonts', async () => {
    const sw = load(fetchImpl)
    sw.caches.stores.set('clubping-shell-old', new Map([[`${ORIGIN}/index.html`, 'stale']]))
    sw.caches.stores.set('clubping-runtime', new Map([['font', 'kept']]))
    await sw.lifecycle('install')

    await sw.lifecycle('activate')

    expect(sw.caches.stores.has('clubping-shell-old')).toBe(false)
    expect(sw.caches.stores.has('clubping-shell-testbuild')).toBe(true)
    expect(sw.caches.stores.has('clubping-runtime')).toBe(true)
  })
})
