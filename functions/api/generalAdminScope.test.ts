import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { UserRow } from './rows'

// The skeleton of the competition — seasons, phases, divisions, poules, and the
// existence of a club. None of it is any club's property, so all of it is a
// general admin's alone: `isGeneralAdmin`, and nothing else.
//
// Taking it down came first (#570), because those routes are irreversible and
// cascade; building and editing it followed (#576). One rule, so one file —
// this was `adminDeleteScope.test.ts` until the second half arrived.

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
  request(db, 'DELETE', path, undefined, env)

const request = (
  db: D1Database,
  method: string,
  path: string,
  body?: unknown,
  env: Record<string, unknown> = {},
) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

// ---------------------------------------------------------------------------
// #576 — the same objects, built and edited rather than taken down. Fourteen
// routes that asked nothing: any signed-in licensee could open a season, rename
// a division, reorder the table, or register a club.
// ---------------------------------------------------------------------------

/** Every write a route made — the guard's own last_seen_at refresh is not one. */
const wrote = (writes: { sql: string }[]) =>
  writes.filter((w) => !/UPDATE users SET last_seen_at/.test(w.sql))

/**
 * The ten routes whose write this fake can reach. Each asserts the full round
 * trip on the way in, and silence on the way out.
 */
const building = [
  { name: 'POST /seasons', method: 'POST', path: '/seasons',
    body: { displayName: '2030/2031', status: 'upcoming' }, table: /INSERT INTO seasons/ },
  { name: 'PATCH /seasons/:id', method: 'PATCH', path: '/seasons/30',
    body: { status: 'upcoming' }, table: /UPDATE seasons/ },
  { name: 'POST /phases', method: 'POST', path: '/phases',
    body: { id: 'ph-1', seasonId: '30', name: 'Phase 1', status: 'upcoming' },
    table: /INSERT INTO phases/ },
  { name: 'PATCH /phases/:id', method: 'PATCH', path: '/phases/ph-1',
    body: { name: 'Phase 2' }, table: /UPDATE phases/ },
  { name: 'POST /divisions', method: 'POST', path: '/divisions',
    body: { id: 'div-1', phaseId: 'ph-1', displayName: 'GE 7', rank: 1 },
    table: /INSERT INTO divisions/ },
  { name: 'PATCH /divisions/:id', method: 'PATCH', path: '/divisions/div-1',
    body: { displayName: 'GE 8' }, table: /UPDATE divisions/ },
  { name: 'POST /divisions/:id/move', method: 'POST', path: '/divisions/div-1/move',
    body: { otherId: 'div-2', myNewRank: 2, otherNewRank: 1 }, table: /UPDATE divisions/ },
  { name: 'POST /clubs', method: 'POST', path: '/clubs',
    body: { id: 'club-x', displayName: 'PPA Rixheim', affiliationNumber: '06680011' },
    table: /INSERT INTO clubs/ },
  { name: 'POST /groups', method: 'POST', path: '/groups',
    body: { id: 'grp-1', divisionId: 'div-1', number: 1, teamIds: [] },
    table: /INSERT INTO groups/ },
  { name: 'PATCH /groups/:id', method: 'PATCH', path: '/groups/grp-1',
    body: { number: 2 }, table: /UPDATE groups/ },
] as const

for (const route of building) {
  describe(route.name, () => {
    it('lets a general admin through, and writes', async () => {
      const { db, writes } = fakeDb([generalAdmin], 'ga')
      const res = await request(db, route.method, route.path, route.body)
      expect(res.status).toBeLessThan(400)
      expect(writes.some((w) => route.table.test(w.sql))).toBe(true)
    })

    it('refuses a club admin, and writes nothing', async () => {
      const { db, writes } = fakeDb([clubAdmin], 'ca')
      const res = await request(db, route.method, route.path, route.body)
      expect(res.status).toBe(403)
      expect(await errorOf(res)).toBe('not_allowed')
      expect(wrote(writes)).toEqual([])
    })

    it('refuses a player, and writes nothing', async () => {
      const { db, writes } = fakeDb([player], 'p1')
      expect((await request(db, route.method, route.path, route.body)).status).toBe(403)
      expect(wrote(writes)).toEqual([])
    })

    it('admits the local escape hatch', async () => {
      const { db } = fakeDb([], null)
      const res = await request(db, route.method, route.path, route.body, {
        AUTH_GUARD_DISABLED: 'true',
      })
      expect(res.status).not.toBe(403)
    })
  })
}

/**
 * The four that reach FFTT or a context this fake has no rows for. Their happy
 * path is not this file's business — what is, is that a refusal happens
 * **before** the network call or the lookup, and leaves nothing behind.
 */
const reaching = [
  { name: 'POST /seasons/import-current', path: '/seasons/import-current', body: {} },
  { name: 'POST /fftt/organizations/refresh', path: '/fftt/organizations/refresh', body: {} },
  { name: 'POST /divisions/import', path: '/divisions/import',
    body: { organizationId: '15', seasonId: '30', phase: 1 } },
  { name: 'POST /groups/import', path: '/groups/import',
    body: { divisionId: 'div-1', pools: [] } },
] as const

for (const route of reaching) {
  describe(route.name, () => {
    // These reach FFTT once past the guard. The refusals never get that far —
    // which is the point — but the admitted call would, so `fetch` is stubbed
    // rather than left to dial a federation server from a unit test.
    afterEach(() => vi.unstubAllGlobals())
    const noNetwork = () =>
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })))

    it('refuses a club admin, and writes nothing', async () => {
      const { db, writes } = fakeDb([clubAdmin], 'ca')
      const res = await request(db, 'POST', route.path, route.body)
      expect(res.status).toBe(403)
      expect(wrote(writes)).toEqual([])
    })

    it('refuses a player, and writes nothing', async () => {
      const { db, writes } = fakeDb([player], 'p1')
      expect((await request(db, 'POST', route.path, route.body)).status).toBe(403)
      expect(wrote(writes)).toEqual([])
    })

    it('does not refuse a general admin', async () => {
      noNetwork()
      const { db } = fakeDb([generalAdmin], 'ga')
      const res = await request(db, 'POST', route.path, route.body)
      expect(res.status).not.toBe(403)
    })
  })
}
