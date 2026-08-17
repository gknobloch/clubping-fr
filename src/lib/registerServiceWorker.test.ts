import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

// The worker is registered only in a built app (#387). These pin the two
// halves of that: a built app registers, and anything else actively clears a
// registration left behind — a worker still serving an old build's assets to
// `vite dev` makes edits look like they did not take, which is a confusing
// afternoon for whoever hits it.

const register = vi.fn(() => Promise.resolve({}))
const unregister = vi.fn(() => Promise.resolve(true))
const getRegistrations = vi.fn(() => Promise.resolve([{ unregister }]))

function withServiceWorker(present: boolean) {
  if (!present) {
    Reflect.deleteProperty(navigator, 'serviceWorker')
    return
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations },
  })
}

/** The app registers after `load`; in a test nothing fires it on its own. */
function fireLoad() {
  window.dispatchEvent(new Event('load'))
}

// Each test gets its own `load` listeners. They live on the one `window` the
// suite shares, so without this a listener left by an earlier test answers a
// later test's `fireLoad` and the assertions are about the wrong call.
const added: Array<[string, EventListenerOrEventListenerObject]> = []
const realAddEventListener = window.addEventListener.bind(window)

beforeEach(() => {
  vi.clearAllMocks()
  withServiceWorker(true)
  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
    added.push([type, listener])
    realAddEventListener(type, listener)
  }) as typeof window.addEventListener
})

afterEach(() => {
  added.splice(0).forEach(([type, listener]) => window.removeEventListener(type, listener))
  window.addEventListener = realAddEventListener
  vi.unstubAllEnvs()
  withServiceWorker(false)
})

describe('registerServiceWorker (#387)', () => {
  it('registers the worker in a built app', async () => {
    vi.stubEnv('PROD', true)

    registerServiceWorker()
    fireLoad()

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('clears a stale registration outside a built app', async () => {
    vi.stubEnv('PROD', false)

    registerServiceWorker()
    await vi.waitFor(() => expect(unregister).toHaveBeenCalled())

    fireLoad()
    expect(register).not.toHaveBeenCalled()
  })

  it('says nothing when the browser has no service workers at all', () => {
    withServiceWorker(false)
    vi.stubEnv('PROD', true)

    expect(() => registerServiceWorker()).not.toThrow()
  })

  // Private mode refuses registration outright. Losing the offline launch is
  // the cost; losing the app is not.
  it('carries on when registration is refused', async () => {
    vi.stubEnv('PROD', true)
    register.mockRejectedValueOnce(new Error('denied'))

    registerServiceWorker()

    expect(() => fireLoad()).not.toThrow()
  })
})
