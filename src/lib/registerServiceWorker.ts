/**
 * Registers the service worker that lets the installed app launch with no
 * network (#387).
 *
 * Only in a built app. `vite dev` serves modules the browser is meant to
 * refetch on every change, and a worker caching those makes edits appear not
 * to take — the confusion is worse than the feature is worth. E2E runs the dev
 * server too, so the worker is exercised against `vite preview` instead.
 */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  if (!import.meta.env.PROD) {
    // A worker registered by an earlier build stays in place on localhost and
    // would go on serving that build's assets to the dev server. Clear it.
    void navigator.serviceWorker.getRegistrations?.().then((regs) => {
      regs.forEach((reg) => void reg.unregister())
    }).catch(() => {
      /* nothing registered, or the browser refuses to say */
    })
    return
  }

  // After load: registration competes with the first data fetch for the
  // connection otherwise, and this only matters from the second launch on.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Private mode, an unsupported browser, or a failed fetch of sw.js.
      // Offline launch is then unavailable; everything else works as before.
    })
  })
}
