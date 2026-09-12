import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from './[[path]]'
import { needsSession } from './authGuard'

// `GET /api/client-version` (#508). The endpoint is three lines; what is worth
// pinning is everything around them — that it answers with no session at all,
// that an unset environment publishes no floor rather than an empty-looking
// one, and that a mistyped var is dropped loudly instead of silently disarming
// the gate.

const get = (env: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost/api/client-version'), env)

describe('the version floor is public (#508)', () => {
  it('needs no session', () => {
    expect(needsSession('GET', '/api/client-version')).toBe(false)
  })

  // Only the read. Nothing writes a floor over HTTP — it is a deploy-time var.
  it('still guards every other method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(needsSession(method, '/api/client-version')).toBe(true)
    }
  })

  it('is exact, so no neighbouring path inherits the exemption', () => {
    for (const path of [
      '/api/client-versionx',
      '/api/client-version/latest',
      '/api/clubs/x/api/client-version',
    ]) {
      expect(needsSession('GET', path)).toBe(true)
    }
  })

  // The guard runs before the route, and a 401 here would be indistinguishable
  // from a network failure to a client that is about to fail open anyway.
  it('answers with no Authorization header and no database', async () => {
    const res = await get()
    expect(res.status).toBe(200)
  })
})

describe('what the floor publishes (#508)', () => {
  it('carries both values when both are set', async () => {
    const res = await get({ CLIENT_MIN_VERSION: '1.2.0', CLIENT_LATEST_VERSION: '1.3.0' })
    expect(await res.json()).toEqual({ minSupported: '1.2.0', latest: '1.3.0' })
  })

  // Unset means no floor. The key has to be absent, not null or "": the client
  // reads `minSupported` and must see nothing to compare against.
  it('publishes nothing at all when nothing is configured', async () => {
    expect(await (await get()).json()).toEqual({})
  })

  it('omits the half that is unset', async () => {
    expect(await (await get({ CLIENT_LATEST_VERSION: '1.3.0' })).json()).toEqual({
      latest: '1.3.0',
    })
    expect(await (await get({ CLIENT_MIN_VERSION: '1.3.0' })).json()).toEqual({
      minSupported: '1.3.0',
    })
  })
})

describe('a floor nobody could parse (#508)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // `versionVerdict` ignores what it cannot read, so a typo leaves the gate
  // open while the variable sits there looking set. Dropping it here means the
  // endpoint never advertises a floor no client can act on.
  it('drops the value rather than publishing it', async () => {
    const res = await get({ CLIENT_MIN_VERSION: '1.3.x', CLIENT_LATEST_VERSION: 'v1.4.0' })
    expect(await res.json()).toEqual({})
  })

  it('names the variable and the value in the log', async () => {
    await get({ CLIENT_MIN_VERSION: '1.3.x' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CLIENT_MIN_VERSION'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('1.3.x'))
  })

  it('keeps the half that is usable', async () => {
    const res = await get({ CLIENT_MIN_VERSION: 'nonsense', CLIENT_LATEST_VERSION: '1.3.0' })
    expect(await res.json()).toEqual({ latest: '1.3.0' })
  })
})
