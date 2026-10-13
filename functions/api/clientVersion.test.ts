// @vitest-environment node
//
// node, not happy-dom: the store versions (#708) are read from a real
// `node:sqlite`, migrated like production.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from './[[path]]'
import { needsSession } from './authGuard'
import { migratedD1 } from './migratedD1.testkit'

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

/** A database whose last store read found these versions (#708). */
function stores(served: Partial<Record<'ios' | 'android', string>>) {
  const d1 = migratedD1()
  for (const [platform, version] of Object.entries(served)) {
    d1.exec(
      "INSERT INTO store_releases (platform, version, checked_at) VALUES (?, ?, '2026-10-13T04:00:00Z')",
      platform,
      version,
    )
  }
  return d1.db
}

const BOTH_LIVE = { ios: '1.3.0', android: '1.3.0' }

describe('what the floor publishes (#508)', () => {
  it('carries both values when both are set', async () => {
    const res = await get({
      CLIENT_MIN_VERSION: '1.2.0',
      CLIENT_LATEST_VERSION: '1.3.0',
      DB: stores(BOTH_LIVE),
    })
    expect(await res.json()).toEqual({
      minSupported: '1.2.0',
      latest: '1.3.0',
      latestByPlatform: BOTH_LIVE,
    })
  })

  // Unset means no floor. The key has to be absent, not null or "": the client
  // reads `minSupported` and must see nothing to compare against.
  it('publishes nothing at all when nothing is configured', async () => {
    expect(await (await get()).json()).toEqual({})
  })

  it('omits the half that is unset', async () => {
    expect(await (await get({ CLIENT_LATEST_VERSION: '1.3.0', DB: stores(BOTH_LIVE) })).json()).toEqual({
      latest: '1.3.0',
      latestByPlatform: BOTH_LIVE,
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
    const res = await get({
      CLIENT_MIN_VERSION: 'nonsense',
      CLIENT_LATEST_VERSION: '1.3.0',
      DB: stores(BOTH_LIVE),
    })
    expect(await res.json()).toMatchObject({ latest: '1.3.0' })
  })
})

// The var is raised in the release's bump PR, days before either store has
// approved the build. Advertising it then sent every member to a store page
// with nothing new on it (#708).
describe('the latest is what the stores serve (#708)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('waits for both stores before telling builds that cannot say which they are', async () => {
    const res = await get({ CLIENT_LATEST_VERSION: '1.8.0', DB: stores({ ios: '1.8.0', android: '1.7.0' }) })
    expect(await res.json()).toEqual({
      latest: '1.7.0',
      latestByPlatform: { ios: '1.8.0', android: '1.7.0' },
    })
  })

  it('keeps advertising what the stores serve the day the bump PR deploys', async () => {
    const res = await get({ CLIENT_LATEST_VERSION: '1.8.0', DB: stores({ ios: '1.7.0', android: '1.7.0' }) })
    expect(await res.json()).toMatchObject({ latest: '1.7.0' })
  })

  // The var stays a ceiling: a store build nobody chose to advertise is not.
  it('never advertises past the var', async () => {
    const res = await get({ CLIENT_LATEST_VERSION: '1.7.0', DB: stores({ ios: '1.8.0', android: '1.8.0' }) })
    expect(await res.json()).toEqual({
      latest: '1.7.0',
      latestByPlatform: { ios: '1.7.0', android: '1.7.0' },
    })
  })

  it('names only the store it has read', async () => {
    const res = await get({ CLIENT_LATEST_VERSION: '1.8.0', DB: stores({ ios: '1.8.0' }) })
    expect(await res.json()).toEqual({ latestByPlatform: { ios: '1.8.0' } })
  })

  it('advertises nothing before the first read', async () => {
    expect(await (await get({ CLIENT_LATEST_VERSION: '1.8.0', DB: stores({}) })).json()).toEqual({})
  })

  // The route answers at boot for every build: a broken table must cost the
  // banner, never the floor and never a 500.
  it('advertises nothing, and still answers, when the table cannot be read', async () => {
    const broken = { prepare: () => { throw new Error('no such table') } } as unknown as D1Database
    const res = await get({ CLIENT_MIN_VERSION: '1.2.0', CLIENT_LATEST_VERSION: '1.8.0', DB: broken })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ minSupported: '1.2.0' })
  })

  it('ignores a store row no client could parse', async () => {
    const res = await get({ CLIENT_LATEST_VERSION: '1.8.0', DB: stores({ ios: '1.8.0-beta', android: '1.8.0' }) })
    expect(await res.json()).toEqual({ latestByPlatform: { android: '1.8.0' } })
  })

  it('never reads the stores when no var is set, as on a preview', async () => {
    const prepare = vi.fn()
    const res = await get({ DB: { prepare } as unknown as D1Database })
    expect(await res.json()).toEqual({})
    expect(prepare).not.toHaveBeenCalled()
  })
})
