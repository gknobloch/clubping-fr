import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { UserRow } from './rows'

// #569 — who may answer for a licensee, compose a line-up, and run a team.
// These five routes asked nothing at all: a valid session was the whole guard,
// so any signed-in member could reply for anyone on any fixture of any club,
// compose the opposition, or move a team between clubs.
//
// The rule itself is pinned down in src/lib/teamAuthority.spec.ts. What these
// tests check is that the routes ask it, refuse what they should, write nothing
// when they refuse — and that `overridden_by` is what the server decided rather
// than what the caller claimed.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const CLUB = 'club-fftt-06680011'
const OTHER = 'club-fftt-06680105'
const GAME = 'game-1'
const HOME = 'team-home'
const AWAY = 'team-away'

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
const captain = member({ id: 'cap' })
const ours = member({ id: 'p-ours' })
const mate = member({ id: 'p-mate' })
const theirs = member({ id: 'p-theirs', club_id: OTHER })

interface TeamFixture { id: string; club_id: string; captain_id: string }
const homeTeam: TeamFixture = { id: HOME, club_id: CLUB, captain_id: 'cap' }
const awayTeam: TeamFixture = { id: AWAY, club_id: OTHER, captain_id: 'cap-b' }

/**
 * Enough D1 for the guard (a session, then the viewer), for the fixture and
 * team lookups these routes now make, and for the previous-answer read the
 * captain's ping needs (#495) — recording every write.
 */
function fakeDb(users: UserRow[], viewerId: string | null, teams = [homeTeam, awayTeam]) {
  const writes: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async first() {
          if (sql.includes('FROM sessions')) {
            // Keyed by the digest since #410, so answer to exactly what the
            // lookup binds rather than to the token as presented.
            const key = await sessionKey(TOKEN)
            return viewerId && params.includes(key)
              ? { token: key, user_id: viewerId, expires_at: Date.now() + HOUR }
              : null
          }
          if (sql.includes('FROM users WHERE id = ?')) {
            return users.find((u) => u.id === params[0]) ?? null
          }
          if (sql.includes('FROM teams WHERE id = ?')) {
            return teams.find((t) => t.id === params[0]) ?? null
          }
          // The previous availability, read before the upsert overwrites it.
          if (sql.includes('FROM game_availabilities')) return null
          return null
        },
        async all() {
          // Both sides of a fixture.
          if (sql.includes('FROM games g') && sql.includes('JOIN teams t')) {
            return { results: params[0] === GAME ? teams : [] }
          }
          return { results: [] }
        },
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

/** The writes a feature makes — the guard's own last_seen_at refresh is not one. */
const featureWrites = <T extends { sql: string }>(writes: T[]) =>
  writes.filter((w) => !/UPDATE users SET last_seen_at/.test(w.sql))

const availability = (playerId: string, over: Record<string, unknown> = {}) =>
  ({ gameId: GAME, playerId, status: 'available', ...over })

describe('POST /game-availabilities/set — answering for a licensee', () => {
  it('lets a player answer for themselves', async () => {
    const { db, writes } = fakeDb([ours], 'p-ours')
    const res = await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))
    expect(res.status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/INSERT INTO game_availabilities/)
  })

  it('lets the captain answer for a licensee of their club', async () => {
    const { db, writes } = fakeDb([captain, ours], 'cap')
    expect((await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))).status).toBe(200)
    expect(featureWrites(writes)).toHaveLength(1)
  })

  it('lets the club admin answer for one of theirs', async () => {
    const { db } = fakeDb([clubAdmin, ours], 'ca')
    expect((await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))).status).toBe(200)
  })

  // The heart of it: a team-mate is not a captain, and had no standing at all.
  it('refuses a team-mate, and writes nothing', async () => {
    const { db, writes } = fakeDb([mate, ours], 'p-mate')
    const res = await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))
    expect(res.status).toBe(403)
    expect(await errorOf(res)).toBe('not_allowed')
    expect(featureWrites(writes)).toEqual([])
  })

  // The conjunct the screens left implicit: a club admin is on this fixture,
  // but the licensee is the opposition's.
  it("refuses a club admin answering for the opposing club's licensee", async () => {
    const { db, writes } = fakeDb([clubAdmin, theirs], 'ca')
    expect((await send(db, '/game-availabilities/set', 'POST', availability('p-theirs'))).status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a club admin with no team on this fixture at all', async () => {
    const outsider = member({ id: 'ca3', role: 'club_admin', club_id: 'club-c' })
    const { db } = fakeDb([outsider, ours], 'ca3')
    expect((await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))).status).toBe(403)
  })

  // #462: a general admin composes any team but answers for nobody.
  it('refuses a general admin', async () => {
    const { db } = fakeDb([generalAdmin, ours], 'ga')
    expect((await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))).status).toBe(403)
  })

  it('admits the away captain through their own side of the fixture', async () => {
    const awayCaptain = member({ id: 'cap-b', club_id: OTHER })
    const { db } = fakeDb([awayCaptain, theirs], 'cap-b')
    expect((await send(db, '/game-availabilities/set', 'POST', availability('p-theirs'))).status).toBe(200)
  })

  // Not a refusal, and it should not read as one: nothing was forbidden, the
  // fixture simply is not there.
  it('answers 404 for a fixture it has never heard of', async () => {
    const { db } = fakeDb([ours], 'p-ours')
    const body = availability('p-ours', { gameId: 'no-such-game' })
    const res = await send(db, '/game-availabilities/set', 'POST', body)
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toBe('not_found')
  })

  it('admits the local escape hatch', async () => {
    const { db } = fakeDb([], null)
    const res = await send(db, '/game-availabilities/set', 'POST', availability('p-ours'), {
      AUTH_GUARD_DISABLED: 'true',
    })
    expect(res.status).toBe(200)
  })
})

// `overridden_by` is what makes a screen say "répondu par le capitaine". Taking
// it from the body let any caller sign somebody else's name to an answer.
describe('overridden_by is derived, not believed', () => {
  const overriddenOf = (writes: { sql: string; params: unknown[] }[]) => {
    const w = writes.find((x) => /INSERT INTO game_availabilities/.test(x.sql))
    return w?.params[3]
  }

  it('records nothing when a player answers for themselves, whatever they claim', async () => {
    const { db, writes } = fakeDb([ours], 'p-ours')
    await send(db, '/game-availabilities/set', 'POST', availability('p-ours', { overriddenBy: 'captain' }))
    expect(overriddenOf(writes)).toBeNull()
  })

  it('records the captain when the captain answers', async () => {
    const { db, writes } = fakeDb([captain, ours], 'cap')
    await send(db, '/game-availabilities/set', 'POST', availability('p-ours'))
    expect(overriddenOf(writes)).toBe('captain')
  })

  it("records the club admin, not the captaincy they claimed", async () => {
    const { db, writes } = fakeDb([clubAdmin, ours], 'ca')
    await send(db, '/game-availabilities/set', 'POST', availability('p-ours', { overriddenBy: 'captain' }))
    expect(overriddenOf(writes)).toBe('club_admin')
  })
})

describe('POST /game-availabilities/clear — withdrawing is answering', () => {
  it('lets the captain clear one of theirs', async () => {
    const { db, writes } = fakeDb([captain, ours], 'cap')
    const res = await send(db, '/game-availabilities/clear', 'POST', { gameId: GAME, playerId: 'p-ours' })
    expect(res.status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/DELETE FROM game_availabilities/)
  })

  it('refuses a team-mate, and deletes nothing', async () => {
    const { db, writes } = fakeDb([mate, ours], 'p-mate')
    const res = await send(db, '/game-availabilities/clear', 'POST', { gameId: GAME, playerId: 'p-ours' })
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })
})

describe('the line-up writers', () => {
  const lineUp = (teamId: string) => ({ gameId: GAME, teamId, playerIds: ['p-ours'] })

  it('lets the captain compose their own team', async () => {
    const { db, writes } = fakeDb([captain], 'cap')
    const res = await send(db, '/game-selections/set', 'POST', lineUp(HOME))
    expect(res.status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/INSERT INTO game_selections/)
  })

  it('refuses the captain composing the opposition, and writes nothing', async () => {
    const { db, writes } = fakeDb([captain], 'cap')
    const res = await send(db, '/game-selections/set', 'POST', lineUp(AWAY))
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a plain member of the club', async () => {
    const { db } = fakeDb([mate], 'p-mate')
    expect((await send(db, '/game-selections/set', 'POST', lineUp(HOME))).status).toBe(403)
  })

  // Unlike answering, composing is something a general admin may do (#462).
  it('lets a general admin compose any team', async () => {
    const { db } = fakeDb([generalAdmin], 'ga')
    expect((await send(db, '/game-selections/set', 'POST', lineUp(AWAY))).status).toBe(200)
  })

  it('refuses the whole batch when one line names a team the caller does not run', async () => {
    const { db, writes } = fakeDb([clubAdmin], 'ca')
    const res = await send(db, '/game-selections/batch', 'POST', {
      updates: [lineUp(HOME), lineUp(AWAY)],
    })
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('writes a batch that names only the caller‘s own teams', async () => {
    const { db, writes } = fakeDb([clubAdmin], 'ca')
    const res = await send(db, '/game-selections/batch', 'POST', { updates: [lineUp(HOME)] })
    expect(res.status).toBe(200)
    expect(featureWrites(writes)).toHaveLength(1)
  })

  it('admits the local escape hatch', async () => {
    const { db } = fakeDb([], null)
    const res = await send(db, '/game-selections/set', 'POST', lineUp(AWAY), {
      AUTH_GUARD_DISABLED: 'true',
    })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /teams/:id — running a team, and moving one', () => {
  it('lets the captain edit their roster', async () => {
    const { db, writes } = fakeDb([captain], 'cap')
    const res = await send(db, `/teams/${HOME}`, 'PATCH', { playerIds: ['p-ours'] })
    expect(res.status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/UPDATE teams SET player_ids/)
  })

  it("refuses the captain editing another club's team", async () => {
    const { db, writes } = fakeDb([captain], 'cap')
    expect((await send(db, `/teams/${AWAY}`, 'PATCH', { playerIds: [] })).status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a plain member', async () => {
    const { db } = fakeDb([mate], 'p-mate')
    expect((await send(db, `/teams/${HOME}`, 'PATCH', { captainId: 'p-mate' })).status).toBe(403)
  })

  // A captain runs their team; where it sits in the competition is not theirs.
  it('refuses a captain renumbering their own team', async () => {
    const { db, writes } = fakeDb([captain], 'cap')
    const res = await send(db, `/teams/${HOME}`, 'PATCH', { number: 2 })
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('lets the club admin renumber it', async () => {
    const { db } = fakeDb([clubAdmin], 'ca')
    expect((await send(db, `/teams/${HOME}`, 'PATCH', { number: 2 })).status).toBe(200)
  })

  // #558's rule: a move writes on the club it leaves and on the one it joins.
  it('refuses a club admin moving their team into another club', async () => {
    const { db, writes } = fakeDb([clubAdmin], 'ca')
    expect((await send(db, `/teams/${HOME}`, 'PATCH', { clubId: OTHER })).status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it("refuses a club admin pulling another club's team into their own", async () => {
    const { db } = fakeDb([otherClubAdmin], 'ca2')
    expect((await send(db, `/teams/${HOME}`, 'PATCH', { clubId: OTHER })).status).toBe(403)
  })

  it('lets a general admin move a team between clubs', async () => {
    const { db, writes } = fakeDb([generalAdmin], 'ga')
    expect((await send(db, `/teams/${HOME}`, 'PATCH', { clubId: OTHER })).status).toBe(200)
    expect(featureWrites(writes)[0].sql).toMatch(/UPDATE teams SET club_id/)
  })

  it('answers 404 for a team it has never heard of', async () => {
    const { db } = fakeDb([clubAdmin], 'ca')
    const res = await send(db, '/teams/no-such-team', 'PATCH', { playerIds: [] })
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toBe('not_found')
  })

  it('admits the local escape hatch', async () => {
    const { db } = fakeDb([], null)
    const res = await send(db, `/teams/${HOME}`, 'PATCH', { number: 9 }, { AUTH_GUARD_DISABLED: 'true' })
    expect(res.status).toBe(200)
  })
})
