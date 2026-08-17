import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// ---------------------------------------------------------------------------
// Offline launch (#387, step 3)
//
// Runs against `vite preview`, not the dev server the rest of the suite uses:
// the worker is only registered in a built app, because one caching the dev
// server's modules would make edits appear not to take.
//
// This is the acceptance criterion the earlier steps could not reach — with no
// worker, a launch with no network fails before any of our code runs, so the
// offline banner and the cached data are never even asked for.
// ---------------------------------------------------------------------------

/**
 * Resolves once the worker controls the page *and* the shell is actually in the
 * cache. Waiting on the controller alone is not enough: it goes live the moment
 * the worker activates, and a test that cut the network right then found an
 * empty cache — the same race a member hits if they install the app and walk
 * straight into the basement, which the worker finishes on its own.
 */
async function shellCached(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 15_000,
  })
  await page.waitForFunction(
    async () => {
      const name = (await caches.keys()).find((n) => n.startsWith('clubping-shell-'))
      if (!name) return false
      const paths = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)
      return paths.includes('/index.html') && paths.some((p) => p.endsWith('.js'))
    },
    null,
    { timeout: 15_000 },
  )
}

test.describe('Lancement hors ligne (#387)', () => {
  test('démarre sans réseau et le dit, au lieu d’échouer', async ({ page, context }) => {
    await loginAs(page, 'lotz')
    await shellCached(page)

    // The launch from a home screen in a sports hall, in one line.
    await context.setOffline(true)
    await page.reload()

    // The document loaded at all — this is what the worker is for.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toContainText(/Hors ligne|Mode hors ligne/)

    await context.setOffline(false)
  })

  test('sert aussi une route profonde hors ligne', async ({ page, context }) => {
    await loginAs(page, 'lotz')
    await shellCached(page)

    // A member reopens the app where they left it. The path has no file behind
    // it — the worker has to answer the navigation with the cached document
    // and let the router take it from there.
    await context.setOffline(true)
    await page.goto('/equipes')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await context.setOffline(false)
  })

  // The worker must not become a second, unkeyed copy of the member's data:
  // DataContext's cache is keyed to them and dropped at logout, and a copy in
  // the Cache API would outlive the session on a shared phone.
  test('ne met jamais l’API en cache', async ({ page }) => {
    await loginAs(page, 'lotz')
    await shellCached(page)

    const cachedApiEntries = await page.evaluate(async () => {
      const names = await caches.keys()
      const urls: string[] = []
      for (const name of names) {
        const cache = await caches.open(name)
        for (const request of await cache.keys()) urls.push(request.url)
      }
      return urls.filter((u) => new URL(u).pathname.startsWith('/api/'))
    })

    expect(cachedApiEntries).toEqual([])
  })

  test('garde la coque en cache sans l’encombrer des gros modules optionnels', async ({ page }) => {
    await loginAs(page, 'lotz')
    await shellCached(page)

    const shell = await page.evaluate(async () => {
      const name = (await caches.keys()).find((n) => n.startsWith('clubping-shell-'))!
      const cache = await caches.open(name)
      return (await cache.keys()).map((r) => new URL(r.url).pathname)
    })

    expect(shell).toContain('/index.html')
    expect(shell.some((p) => p.endsWith('.css'))).toBe(true)
    // pdf.js and tesseract.js are ~2.6 MB and serve one admin import flow;
    // making a phone download them to be "offline ready" would be a bad trade.
    expect(shell.filter((p) => /pdf|tesseract/.test(p))).toEqual([])
  })
})
