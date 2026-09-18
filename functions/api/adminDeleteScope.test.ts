import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { UserRow } from './rows'

// #570 — the five destructive routes that belong to nobody's club. They asked
// nothing at all: a valid session was the whole guard, so any signed-in
// licensee could delete any club with its addresses, channels and logo, or take
// a season, a phase, a division or a poule's calendar with them.
//
// What matters as much as the 403 is that nothing reaches the batch: these
// routes delete in one `db.batch`, so a guard that refused after writing would
// look identical from the outside.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const CLUB = 'club-fftt-06680011'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: CLUB, first_login_at: null, last_seen_at: Date.now(),
  notifications_enabled: 1,
  ...over,
})

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const clubAdmin = member({ id: 'ca', role: 'club_admin' })
const player = member({ id: 'p1' })

/** Enough D1 for the guard, recording every statement the routes would run. */
function fakeDb(users: UserRow[], viewerId: string | null) {
  const writes: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
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
        async run() {
          writes.push({ sql, params })
          return { success: true }
        },
      })
      return {
        bind: (...params: unknown[]) => ({ ...bound(params), __write: { sql, params } }),
        async first() { return null },
        async all() { return { results: [] } },
        async run() { writes.push({ sql, params: [] }); return { success: true } },
      }
    },
    async batch(stmts: unknown[]) {
      for (const stmt of stmts) {
        const recorded = (stmt as { __write?: { sql: string; params: unknown[] } }).__write
        if (recorded) writes.push(recorded)
      }
      return stmts.map(() => ({ success: true }))
    },
  } as unknown as D1Database
  return { db, writes }
}

const send = (db: D1Database, path: string, env: Record<string, unknown> = {}) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    { DB: db, ...env },
  )

const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error

/** The deletes a route makes — the guard's own last_seen_at refresh is not one. */
const deletes = (writes: { sql: string }[]) => writes.filter((w) => /^\s*DELETE/i.test(w.sql))

// Each route, and the table whose disappearance proves it ran.
const routes = [
  { name: 'DELETE /clubs/:id', path: `/clubs/${CLUB}`, table: /DELETE FROM clubs/ },
  { name: 'DELETE /seasons/:id', path: '/seasons/27', table: /DELETE FROM seasons/ },
  { name: 'DELETE /phases/:id', path: '/phases/phase-1', table: /DELETE FROM phases/ },
  { name: 'DELETE /divisions/:id', path: '/divisions/div-1', table: /DELETE FROM divisions/ },
  { name: "DELETE /groups/:id/games", path: '/groups/group-1/games', table: /DELETE FROM games/ },
  // Not named by #570, and strictly worse than clearing the calendar: this one
  // takes the poule, its teams and their fixtures.
  { name: 'DELETE /groups/:id', path: '/groups/group-1', table: /DELETE FROM groups/ },
] as const

for (const route of routes) {
  describe(route.name, () => {
    it('lets a general admin through', async () => {
      const { db, writes } = fakeDb([generalAdmin], 'ga')
      const res = await send(db, route.path)
      expect(res.status).toBe(200)
      expect(writes.some((w) => route.table.test(w.sql))).toBe(true)
    })

    // A club admin runs their club; none of these objects is their club's.
    it('refuses a club admin, and deletes nothing', async () => {
      const { db, writes } = fakeDb([clubAdmin], 'ca')
      const res = await send(db, route.path)
      expect(res.status).toBe(403)
      expect(await errorOf(res)).toBe('not_allowed')
      expect(deletes(writes)).toEqual([])
    })

    it('refuses a player, and deletes nothing', async () => {
      const { db, writes } = fakeDb([player], 'p1')
      expect((await send(db, route.path)).status).toBe(403)
      expect(deletes(writes)).toEqual([])
    })

    it('admits the local escape hatch', async () => {
      const { db } = fakeDb([], null)
      expect((await send(db, route.path, { AUTH_GUARD_DISABLED: 'true' })).status).toBe(200)
    })
  })
}

// `DELETE /clubs/:id` is the one that takes other tables with it, in a single
// batch: a guard that ran after it would leave the club's addresses, channels
// and logo gone and answer 403 about it.
describe('a refused club deletion leaves its addresses, channels and logo alone', () => {
  it('sends no statement at all', async () => {
    const { db, writes } = fakeDb([clubAdmin], 'ca')
    await send(db, `/clubs/${CLUB}`)
    expect(writes.filter((w) => /club_addresses|club_channels|club_logos/.test(w.sql))).toEqual([])
  })

  it('sends all four when the general admin asks', async () => {
    const { db, writes } = fakeDb([generalAdmin], 'ga')
    await send(db, `/clubs/${CLUB}`)
    expect(writes.filter((w) => /club_addresses|club_channels|club_logos|DELETE FROM clubs/.test(w.sql)))
      .toHaveLength(4)
  })
})
