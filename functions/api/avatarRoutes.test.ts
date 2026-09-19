import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { UserRow } from './rows'

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

// ---------------------------------------------------------------------------
// #571 — a session was the whole guard on the writes, so any signed-in licensee
// could replace or erase anybody's picture, in any club. An image, shown beside
// a name, everywhere either app prints a member.
//
// The rule is the narrowest in the API: oneself, and nobody else. Both callers
// are "Mon compte" (`ComptePage`, `compte.tsx`) and both resolve the row by
// `p.id === user.id`, so every legitimate write already satisfies it.
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: 'club-1', first_login_at: null, last_seen_at: Date.now(),
  notifications_enabled: 1,
  ...over,
})

const me = member({ id: 'me' })
const teammate = member({ id: 'mate' })
const clubAdmin = member({ id: 'ca', role: 'club_admin' })
const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })

/** Enough D1 for the guard, recording what would have been written. */
function sessionDb(users: UserRow[], viewerId: string | null) {
  const writes: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind: (...params: unknown[]) => ({
          async first() {
            if (sql.includes('FROM sessions')) {
              const key = await sessionKey(TOKEN)
              return viewerId && params.includes(key)
                ? { token: key, user_id: viewerId, expires_at: Date.now() + HOUR }
                : null
            }
            if (sql.includes('FROM users WHERE id = ?')) {
              return users.find((u) => u.id === params[0]) ?? null
            }
            return null
          },
          async all() { return { results: [] } },
          async run() { writes.push({ sql, params }); return { success: true } },
        }),
        async first() { return null },
        async all() { return { results: [] } },
        async run() { writes.push({ sql, params: [] }); return { success: true } },
      }
    },
  } as unknown as D1Database
  return { db, writes }
}

const write = (
  db: D1Database,
  path: string,
  method: 'PUT' | 'DELETE',
  env: Record<string, unknown> = {},
) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      ...(method === 'PUT' ? { body: JSON.stringify({ data: 'AAAA' }) } : {}),
    }),
    { DB: db, ...env },
  )

/** The avatar writes — the guard's own last_seen_at refresh is not one. */
const avatarWrites = (writes: { sql: string }[]) =>
  writes.filter((w) => /user_avatars/.test(w.sql))

describe('writing an avatar is for oneself alone (#571)', () => {
  it('lets a member put their own picture up', async () => {
    const { db, writes } = sessionDb([me], 'me')
    const res = await write(db, '/users/me/avatar', 'PUT')
    expect(res.status).toBe(200)
    expect(avatarWrites(writes)[0].sql).toMatch(/INSERT INTO user_avatars/)
  })

  it('lets a member take their own picture down', async () => {
    const { db, writes } = sessionDb([me], 'me')
    expect((await write(db, '/users/me/avatar', 'DELETE')).status).toBe(200)
    expect(avatarWrites(writes)[0].sql).toMatch(/DELETE FROM user_avatars/)
  })

  it("refuses a team-mate, and writes nothing", async () => {
    const { db, writes } = sessionDb([teammate, me], 'mate')
    const res = await write(db, '/users/me/avatar', 'PUT')
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error?: string }).error).toBe('not_allowed')
    expect(avatarWrites(writes)).toEqual([])
  })

  it('refuses a team-mate erasing one, which is the cheaper vandalism', async () => {
    const { db, writes } = sessionDb([teammate, me], 'mate')
    expect((await write(db, '/users/me/avatar', 'DELETE')).status).toBe(403)
    expect(avatarWrites(writes)).toEqual([])
  })

  // Narrower than every other rule in the API on purpose: an administrator
  // taking an unsuitable image down is a decision to make, not a consequence.
  it("refuses the member's own club admin", async () => {
    const { db, writes } = sessionDb([clubAdmin, me], 'ca')
    expect((await write(db, '/users/me/avatar', 'PUT')).status).toBe(403)
    expect(avatarWrites(writes)).toEqual([])
  })

  it('refuses a general admin', async () => {
    const { db } = sessionDb([generalAdmin, me], 'ga')
    expect((await write(db, '/users/me/avatar', 'DELETE')).status).toBe(403)
  })

  it('admits the local escape hatch', async () => {
    const { db } = sessionDb([], null)
    const res = await write(db, '/users/me/avatar', 'PUT', { AUTH_GUARD_DISABLED: 'true' })
    expect(res.status).toBe(200)
  })

  // The GET stays open: an <img> carries no Authorization header, so a mistake
  // here hides every avatar rather than failing loudly.
  it('leaves reading alone', async () => {
    const { db } = sessionDb([teammate], 'mate')
    const res = await app.fetch(
      new Request('http://localhost/api/users/me/avatar'),
      { DB: db },
    )
    expect(res.status).toBe(404)
  })
})
