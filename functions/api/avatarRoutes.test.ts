import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'

// #320 — the avatar routes moved from /api/players/:id/avatar to
// /api/users/:id/avatar, matching the fact that the row is keyed by user_id
// and belongs to any member, playing or not.
//
// The GET must stay reachable WITHOUT a session. mobile/utils/avatarSource.ts
// hands a bare URI to <Image>, which cannot attach an Authorization header, so
// a mistake in PUBLIC_IMAGE_PATH would make every avatar silently disappear
// rather than fail loudly. That is what these tests pin down.

/** A database whose avatar lookup finds nothing — enough to tell 404 from 401. */
const emptyDb = {
  prepare: () => ({
    bind: () => ({ first: async () => null, run: async () => ({ success: true }) }),
    all: async () => ({ results: [] }),
  }),
} as unknown as D1Database

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }), { DB: emptyDb })

describe('avatar routes (#320)', () => {
  it('serves the avatar without a session', async () => {
    const res = await get('/api/users/u1/avatar')
    // 404 because this fixture has no avatar — the point is that it is NOT 401,
    // i.e. the request got past the auth guard.
    expect(res.status).toBe(404)
  })

  it('no longer answers on the old /players path', async () => {
    const res = await get('/api/players/u1/avatar')
    // The route is gone and the path is no longer public, so the guard rejects
    // it before routing. Either way it must not serve an image.
    expect(res.status).not.toBe(200)
    expect(res.status).toBe(401)
  })

  it('keeps the public exemption to GET only', async () => {
    for (const method of ['PUT', 'DELETE']) {
      const res = await app.fetch(
        new Request('http://localhost/api/users/u1/avatar', { method }),
        { DB: emptyDb },
      )
      expect(res.status).toBe(401)
    }
  })

  it('does not make the rest of the API public', async () => {
    expect((await get('/api/data')).status).toBe(401)
    // Neither a lookalike path...
    expect((await get('/api/users/u1/avatarx')).status).toBe(401)
    expect((await get('/api/users/u1/avatar/extra')).status).toBe(401)
  })

  it('leaves the club logo exemption intact', async () => {
    const res = await get('/api/clubs/club-1/logo')
    expect(res.status).not.toBe(401)
  })
})
