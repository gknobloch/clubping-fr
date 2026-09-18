import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'
import { sessionKey } from './auth'

// #558 — who may write on a licensee. These routes used to require nothing but
// a valid session, so any signed-in member could create somebody in the club
// next door, rename one of its players, move them out of it, or file the points
// and category that decide their eligibility (#482). The browser was the only
// thing that had ever asked the question (`canEditPlayers` in PlayersPage), and
// since #555 there are two browsers.
//
// The rule is #488's: a general admin everywhere, a club admin at home, and one
// exception — a member editing their own coordinates from "Mon compte".

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const CLUB = 'club-fftt-06680011'
const OTHER = 'club-fftt-06680105'

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
const otherClubAdmin = member({ id: 'ca2', role: 'club_admin', club_id: OTHER })
const ours = member({ id: 'p-ours' })
const theirs = member({ id: 'p-theirs', club_id: OTHER })

/**
 * Enough D1 for the guard (a session, then the viewer) and for the club lookup
 * these routes now make, recording every write. The guard and `clubOfPlayer`
 * both read `FROM users WHERE id = ?`, and a whole row answers both.
 */
function fakeDb(users: UserRow[], viewerId: string | null) {
  const writes: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async first() {
          if (sql.includes('FROM sessions')) {
            // Keyed by the digest, the only form the lookup binds since #410
            // — `sessionKey` so this answers to exactly what the code
            // asks for.
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

/** A request signed in as `viewerId`, or with the local escape hatch in `env`. */
const send = (
  db: D1Database,
  path: string,
  method: string,
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

/** The writes these routes make — the guard's own last_seen_at refresh is not one. */
const featureWrites = <T extends { sql: string }>(writes: T[]) =>
  writes.filter((w) => !/UPDATE users SET last_seen_at/.test(w.sql))

const newPlayer = (clubId: string) => ({
  id: 'p-new', firstName: 'C', lastName: 'D', licenseNumber: '9',
  email: '', phone: '', status: 'active', clubId,
})

describe('POST /players — creating a licensee', () => {
  it('lets a club admin fill their own roster', async () => {
    const { db, writes } = fakeDb([clubAdmin], 'ca')
    const res = await send(db, '/players', 'POST', newPlayer(CLUB))
    expect(res.status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/INSERT INTO users/)
  })

  // The club is named by the body, so this needs no lookup at all — and it is
  // the whole of the hole: a stranger's club id was simply written down.
  it('refuses a club admin creating in another club, and writes nothing', async () => {
    const { db, writes } = fakeDb([clubAdmin], 'ca')
    const res = await send(db, '/players', 'POST', newPlayer(OTHER))
    expect(res.status).toBe(403)
    expect(await errorOf(res)).toBe('not_allowed')
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a player, in their own club as much as anywhere', async () => {
    const { db, writes } = fakeDb([ours], 'p-ours')
    expect((await send(db, '/players', 'POST', newPlayer(CLUB))).status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('lets a general admin create in any club', async () => {
    const { db } = fakeDb([generalAdmin], 'ga')
    expect((await send(db, '/players', 'POST', newPlayer(OTHER))).status).toBe(200)
  })

  // #138: a missing viewer stands in as a general admin, or local development
  // loses the feature and nothing is protected.
  it('admits the local escape hatch', async () => {
    const { db } = fakeDb([], null)
    const res = await send(db, '/players', 'POST', newPlayer(CLUB), { AUTH_GUARD_DISABLED: 'true' })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /players/:id — editing a licensee', () => {
  const rename = { firstName: 'Camille' }

  it('lets a club admin edit a member of their club', async () => {
    const { db, writes } = fakeDb([clubAdmin, ours], 'ca')
    const res = await send(db, `/players/${ours.id}`, 'PATCH', rename)
    expect(res.status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/UPDATE users SET first_name/)
  })

  it("refuses a club admin editing another club's member", async () => {
    const { db, writes } = fakeDb([clubAdmin, theirs], 'ca')
    const res = await send(db, `/players/${theirs.id}`, 'PATCH', rename)
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a player editing a team-mate', async () => {
    const { db, writes } = fakeDb([ours, member({ id: 'p-mate' })], 'p-ours')
    expect((await send(db, '/players/p-mate', 'PATCH', rename)).status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  // Moving somebody writes on the club they leave and on the one they join, so
  // an admin of one of the two is an admin of half the change.
  it('refuses a club admin moving their own member into another club', async () => {
    const { db, writes } = fakeDb([clubAdmin, ours], 'ca')
    const res = await send(db, `/players/${ours.id}`, 'PATCH', { clubId: OTHER })
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it("refuses a club admin pulling another club's member into their own", async () => {
    const { db } = fakeDb([clubAdmin, theirs], 'ca')
    expect((await send(db, `/players/${theirs.id}`, 'PATCH', { clubId: CLUB })).status).toBe(403)
  })

  it('lets a general admin move somebody between clubs', async () => {
    const { db, writes } = fakeDb([generalAdmin, ours], 'ga')
    expect((await send(db, `/players/${ours.id}`, 'PATCH', { clubId: OTHER })).status).toBe(200)
    expect(featureWrites(writes)[0].params).toEqual([OTHER, ours.id])
  })

  // "Mon compte" on both clients (ComptePage, compte.tsx): the four coordinates
  // a member keeps up to date themselves, and no more.
  describe('Mon compte — a member editing themselves', () => {
    const coordinates = {
      email: 'c@example.org', phone: '0799980000',
      birthDate: '1990-01-01', birthPlace: 'Mulhouse',
    }

    it('accepts their own coordinates', async () => {
      const { db, writes } = fakeDb([ours], 'p-ours')
      const res = await send(db, `/players/${ours.id}`, 'PATCH', coordinates)
      expect(res.status).toBe(200)
      expect(featureWrites(writes)[0].sql).toMatch(/UPDATE users SET email/)
    })

    it('refuses a member changing their own club', async () => {
      const { db, writes } = fakeDb([ours], 'p-ours')
      const res = await send(db, `/players/${ours.id}`, 'PATCH', { clubId: OTHER })
      expect(res.status).toBe(403)
      expect(featureWrites(writes)).toEqual([])
    })

    it('refuses a member lifting their own archive', async () => {
      const { db } = fakeDb([member({ id: 'p-ours', status: 'archived' })], 'p-ours')
      expect((await send(db, '/players/p-ours', 'PATCH', { status: 'active' })).status).toBe(403)
    })

    // All or nothing: a patch that smuggles a licence number alongside a phone
    // must not land the half that was allowed.
    it('refuses the whole patch when one field is not theirs to change', async () => {
      const { db, writes } = fakeDb([ours], 'p-ours')
      const res = await send(db, `/players/${ours.id}`, 'PATCH', {
        phone: '0799980000', licenseNumber: '000000',
      })
      expect(res.status).toBe(403)
      expect(featureWrites(writes)).toEqual([])
    })
  })
})

// The import's two batches and the form that clears a category. They write by
// (phase, player) and (season, player), and named no club at all.
describe('the per-player writers', () => {
  const points = (playerId: string) => ({ phaseId: 'phase-1', playerId, points: '1200' })
  const category = (playerId: string) => ({ seasonId: '27', playerId, category: 'V40' })

  const cases = [
    {
      name: 'POST /player-phase-points/batch',
      path: '/player-phase-points/batch',
      method: 'POST',
      body: (ids: string[]) => ({ updates: ids.map(points) }),
      table: /player_phase_points/,
    },
    {
      name: 'POST /player-season-categories/batch',
      path: '/player-season-categories/batch',
      method: 'POST',
      body: (ids: string[]) => ({ updates: ids.map(category) }),
      table: /player_season_categories/,
    },
  ] as const

  for (const c of cases) {
    describe(c.name, () => {
      it("writes a club admin's own members", async () => {
        const { db, writes } = fakeDb([clubAdmin, ours], 'ca')
        const res = await send(db, c.path, c.method, c.body([ours.id]))
        expect(res.status).toBe(200)
        expect(writes.filter((w) => c.table.test(w.sql))).toHaveLength(1)
      })

      it('refuses the whole batch when one line names another club, and writes nothing', async () => {
        const { db, writes } = fakeDb([clubAdmin, ours, theirs], 'ca')
        const res = await send(db, c.path, c.method, c.body([ours.id, theirs.id]))
        expect(res.status).toBe(403)
        expect(await errorOf(res)).toBe('not_allowed')
        expect(writes.filter((w) => c.table.test(w.sql))).toEqual([])
      })

      it('refuses a player, whose own team-mates these are', async () => {
        const { db, writes } = fakeDb([ours], 'p-ours')
        expect((await send(db, c.path, c.method, c.body([ours.id]))).status).toBe(403)
        expect(writes.filter((w) => c.table.test(w.sql))).toEqual([])
      })

      // The web fires its writes without awaiting them, so this batch can
      // overtake the POST /players that creates the licensee it is about.
      // An id nobody knows is not an id belonging to somebody else.
      it('accepts an id the table has never heard of', async () => {
        const { db, writes } = fakeDb([clubAdmin], 'ca')
        const res = await send(db, c.path, c.method, c.body(['p-just-created']))
        expect(res.status).toBe(200)
        expect(writes.filter((w) => c.table.test(w.sql))).toHaveLength(1)
      })

      it('lets a general admin write for any club', async () => {
        const { db } = fakeDb([generalAdmin, theirs], 'ga')
        expect((await send(db, c.path, c.method, c.body([theirs.id]))).status).toBe(200)
      })

      it('admits the local escape hatch', async () => {
        const { db } = fakeDb([], null)
        const res = await send(db, c.path, c.method, c.body([theirs.id]), {
          AUTH_GUARD_DISABLED: 'true',
        })
        expect(res.status).toBe(200)
      })
    })
  }

  describe('DELETE /player-season-categories/:seasonId/:playerId', () => {
    it("clears a category of the admin's own club", async () => {
      const { db, writes } = fakeDb([clubAdmin, ours], 'ca')
      const res = await send(db, `/player-season-categories/27/${ours.id}`, 'DELETE')
      expect(res.status).toBe(200)
      expect(featureWrites(writes)[0].params).toEqual(['27', ours.id])
    })

    it("refuses another club's licensee", async () => {
      const { db, writes } = fakeDb([clubAdmin, theirs], 'ca')
      const res = await send(db, `/player-season-categories/27/${theirs.id}`, 'DELETE')
      expect(res.status).toBe(403)
      expect(featureWrites(writes)).toEqual([])
    })

    it('refuses a player clearing their own category', async () => {
      const { db, writes } = fakeDb([ours], 'p-ours')
      expect((await send(db, `/player-season-categories/27/${ours.id}`, 'DELETE')).status).toBe(403)
      expect(featureWrites(writes)).toEqual([])
    })
  })
})

// A club admin of the other club is a stranger here, and so is a general admin
// of nothing: the role is what decides, never the mere presence of a club id.
describe('the viewer these routes judge against', () => {
  it('refuses the neighbouring club\'s admin outright', async () => {
    const { db } = fakeDb([otherClubAdmin, ours], 'ca2')
    expect((await send(db, '/players', 'POST', newPlayer(CLUB))).status).toBe(403)
    expect((await send(db, `/players/${ours.id}`, 'PATCH', { firstName: 'X' })).status).toBe(403)
  })

  it('refuses a caller whose session names nobody', async () => {
    const { db } = fakeDb([clubAdmin], null)
    expect((await send(db, '/players', 'POST', newPlayer(CLUB))).status).toBe(401)
  })
})
