import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { UserRow } from './rows'

// #577 — everything one club owns, and the things two clubs share.
//
// These twenty routes asked nothing: a valid session was the whole guard, so
// any signed-in licensee could rename the club next door, replace its logo,
// rewrite its addresses, or create and delete its teams.
//
// The club-owned half is #558's `administers`. The shared half — a journée, a
// fixture — is `administersAny`: **either** side, which is the rule the screens
// have always applied to a negotiated slot (#294).

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const MINE = 'club-mine'
const THEIRS = 'club-theirs'
const ELSEWHERE = 'club-elsewhere'

const GROUP = 'group-1'
const OTHER_GROUP = 'group-2'
const GAME = 'game-1'
const MATCH_DAY = 'md-1'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: MINE, first_login_at: null, last_seen_at: Date.now(),
  notifications_enabled: 1,
  ...over,
})

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const myAdmin = member({ id: 'ca', role: 'club_admin' })
const theirAdmin = member({ id: 'ca2', role: 'club_admin', club_id: THEIRS })
const outsideAdmin = member({ id: 'ca3', role: 'club_admin', club_id: ELSEWHERE })
const player = member({ id: 'p1' })

/** Two teams of the same poule, one per club — a fixture waiting to happen. */
interface TeamFixture { id: string; club_id: string; group_id: string; captain_id: string }
const TEAMS: TeamFixture[] = [
  { id: 'team-mine', club_id: MINE, group_id: GROUP, captain_id: 'cap' },
  { id: 'team-theirs', club_id: THEIRS, group_id: GROUP, captain_id: 'cap-b' },
  { id: 'team-far', club_id: ELSEWHERE, group_id: OTHER_GROUP, captain_id: 'cap-c' },
]

/** Enough D1 for the guard and every lookup these routes make. */
function fakeDb(users: UserRow[], viewerId: string | null, teams = TEAMS) {
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
          if (sql.includes('FROM teams WHERE id = ?')) {
            return teams.find((t) => t.id === params[0]) ?? null
          }
          // Which poule a journée belongs to.
          if (sql.includes('FROM match_days WHERE id = ?')) {
            return params[0] === MATCH_DAY ? { group_id: GROUP } : null
          }
          return null
        },
        async all() {
          if (/FROM teams WHERE group_id IN/.test(sql)) {
            return { results: teams.filter((t) => params.includes(t.group_id)).map((t) => ({ club_id: t.club_id })) }
          }
          if (/FROM teams WHERE id IN/.test(sql)) {
            return { results: teams.filter((t) => params.includes(t.id)).map((t) => ({ club_id: t.club_id })) }
          }
          // Both sides of a fixture.
          if (/FROM games g/.test(sql) && /JOIN teams t/.test(sql)) {
            return {
              results: params[0] === GAME
                ? [{ club_id: MINE }, { club_id: THEIRS }]
                : [],
            }
          }
          return { results: [] }
        },
        async run() { writes.push({ sql, params }); return { success: true } },
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

/** Every write a route made — the guard's own last_seen_at refresh is not one. */
const wrote = (writes: { sql: string }[]) =>
  writes.filter((w) => !/UPDATE users SET last_seen_at/.test(w.sql))

// ---------------------------------------------------------------------------
// What one club owns: its identity card, and everything hanging off it.
// ---------------------------------------------------------------------------

const owned = [
  { name: 'PATCH /clubs/:id', method: 'PATCH', path: (c: string) => `/clubs/${c}`,
    body: { displayName: 'Renommé' } },
  { name: 'POST /clubs/:clubId/addresses', method: 'POST', path: (c: string) => `/clubs/${c}/addresses`,
    body: { id: 'a1', label: 'Gymnase', street: 'rue', postalCode: '68170', city: 'Rixheim' } },
  { name: 'PATCH  …/addresses/:addressId', method: 'PATCH', path: (c: string) => `/clubs/${c}/addresses/a1`,
    body: { label: 'Autre' } },
  { name: 'DELETE …/addresses/:addressId', method: 'DELETE', path: (c: string) => `/clubs/${c}/addresses/a1`,
    body: undefined },
  { name: 'POST /clubs/:clubId/channels', method: 'POST', path: (c: string) => `/clubs/${c}/channels`,
    body: { id: 'ch1', type: 'website', link: 'https://example.org', sortOrder: 0 } },
  { name: 'PATCH  …/channels/:channelId', method: 'PATCH', path: (c: string) => `/clubs/${c}/channels/ch1`,
    body: { link: 'https://example.net' } },
  { name: 'DELETE …/channels/:channelId', method: 'DELETE', path: (c: string) => `/clubs/${c}/channels/ch1`,
    body: undefined },
  { name: 'PUT …/channels/reorder', method: 'PUT', path: (c: string) => `/clubs/${c}/channels/reorder`,
    body: { channelIds: ['ch1'] } },
  { name: 'PUT /clubs/:id/logo', method: 'PUT', path: (c: string) => `/clubs/${c}/logo`,
    body: { data: 'AAAA' } },
  { name: 'DELETE /clubs/:id/logo', method: 'DELETE', path: (c: string) => `/clubs/${c}/logo`,
    body: undefined },
] as const

for (const route of owned) {
  describe(route.name, () => {
    it('lets the club\'s own admin through', async () => {
      const { db } = fakeDb([myAdmin], 'ca')
      expect((await request(db, route.method, route.path(MINE), route.body)).status).toBeLessThan(400)
    })

    it('refuses another club\'s admin, and writes nothing', async () => {
      const { db, writes } = fakeDb([theirAdmin], 'ca2')
      const res = await request(db, route.method, route.path(MINE), route.body)
      expect(res.status).toBe(403)
      expect(await errorOf(res)).toBe('not_allowed')
      expect(wrote(writes)).toEqual([])
    })

    it('refuses a plain member of the club itself', async () => {
      const { db, writes } = fakeDb([player], 'p1')
      expect((await request(db, route.method, route.path(MINE), route.body)).status).toBe(403)
      expect(wrote(writes)).toEqual([])
    })

    it('lets a general admin through', async () => {
      const { db } = fakeDb([generalAdmin], 'ga')
      expect((await request(db, route.method, route.path(THEIRS), route.body)).status).toBeLessThan(400)
    })

    it('admits the local escape hatch', async () => {
      const { db } = fakeDb([], null)
      const res = await request(db, route.method, route.path(MINE), route.body, {
        AUTH_GUARD_DISABLED: 'true',
      })
      expect(res.status).not.toBe(403)
    })
  })
}

describe('teams — named by the body coming in, read off the row going out', () => {
  const newTeam = (clubId: string) => ({
    id: 'team-new', clubId, phaseId: 'ph-1', number: 3, groupId: GROUP,
    gameLocationId: 'a1', defaultDay: 'Jeudi', defaultTime: '19h30',
  })

  it('lets a club admin add a team to their own club', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    expect((await request(db, 'POST', '/teams', newTeam(MINE))).status).toBe(200)
    expect(wrote(writes)[0].sql).toMatch(/INSERT INTO teams/)
  })

  it('refuses a club admin adding a team to another club', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    expect((await request(db, 'POST', '/teams', newTeam(THEIRS))).status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it("refuses deleting another club's team, and touches nothing", async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'DELETE', '/teams/team-theirs')
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it('lets a club admin delete their own', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    expect((await request(db, 'DELETE', '/teams/team-mine')).status).toBe(200)
  })

  it('answers 404 for a team it has never heard of', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'DELETE', '/teams/no-such-team')
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toBe('not_found')
  })

  // All or nothing, like #558's batches.
  it('refuses a roster batch naming one team of another club', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'POST', '/teams/batch', {
      updates: [{ id: 'team-mine', playerIds: [] }, { id: 'team-theirs', playerIds: [] }],
    })
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it('writes a batch naming only its own', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'POST', '/teams/batch', {
      updates: [{ id: 'team-mine', playerIds: ['p1'] }],
    })
    expect(res.status).toBe(200)
    expect(wrote(writes)).toHaveLength(1)
  })

  it('refuses a club import aimed at another club', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'POST', '/teams/import', {
      clubId: THEIRS,
      teams: [{ id: 't', gameLocationId: 'a1', defaultDay: 'Jeudi', defaultTime: '19h30' }],
    })
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// What two clubs share. The chosen rule is EITHER side — a negotiated slot
// (#294) concerns both teams, and that is what the screens do.
// ---------------------------------------------------------------------------

describe('a journée and a fixture belong to both clubs', () => {
  const fixture = { id: 'g-new', matchDayId: MATCH_DAY, homeTeamId: 'team-mine', awayTeamId: 'team-theirs' }

  it('lets the home club create the fixture', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    expect((await request(db, 'POST', '/games', fixture)).status).toBe(200)
    expect(wrote(writes).some((w) => /INSERT INTO games/.test(w.sql))).toBe(true)
  })

  // This is the decision: the visitor edits too, rather than asking.
  it('lets the visiting club create it just as well', async () => {
    const { db } = fakeDb([theirAdmin], 'ca2')
    expect((await request(db, 'POST', '/games', fixture)).status).toBe(200)
  })

  it('refuses a club with no team in the fixture at all', async () => {
    const { db, writes } = fakeDb([outsideAdmin], 'ca3')
    expect((await request(db, 'POST', '/games', fixture)).status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it('lets either side negotiate the slot (#294)', async () => {
    for (const [id, viewer] of [['ca', myAdmin], ['ca2', theirAdmin]] as const) {
      const { db } = fakeDb([viewer], id)
      const res = await request(db, 'PATCH', `/games/${GAME}`, { time: '20h00' })
      expect(res.status).toBe(200)
    }
  })

  it('refuses a stranger to both sides', async () => {
    const { db, writes } = fakeDb([outsideAdmin], 'ca3')
    expect((await request(db, 'PATCH', `/games/${GAME}`, { time: '20h00' })).status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  // Judged at both ends, like #558's clubId: the sides it leaves and the ones
  // it joins.
  it('refuses re-pointing a fixture at a team of a club the caller does not run', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'PATCH', `/games/${GAME}`, { awayTeamId: 'team-far' })
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it('answers 404 for a fixture it has never heard of', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'PATCH', '/games/no-such-game', { time: '20h00' })
    expect(res.status).toBe(404)
  })

  it('lets a club playing the poule add a journée', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'POST', '/match-days', { id: 'md-2', groupId: GROUP, number: 2, date: '2026-10-03' })
    expect(res.status).toBe(200)
  })

  it('refuses a club that plays elsewhere', async () => {
    const { db, writes } = fakeDb([outsideAdmin], 'ca3')
    const res = await request(db, 'POST', '/match-days', { id: 'md-2', groupId: GROUP, number: 2, date: '2026-10-03' })
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it('refuses moving a journée into a poule the caller does not play', async () => {
    const { db, writes } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'PATCH', `/match-days/${MATCH_DAY}`, { groupId: OTHER_GROUP })
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  it('allows an edit that stays inside the poule', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    expect((await request(db, 'PATCH', `/match-days/${MATCH_DAY}`, { date: '2026-10-10' })).status).toBe(200)
  })
})

describe('the calendar imports', () => {
  it('refuses a poule the caller does not play', async () => {
    const { db, writes } = fakeDb([outsideAdmin], 'ca3')
    const res = await request(db, 'POST', '/games/import', { groupIds: [GROUP], pools: [] })
    expect(res.status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  // Every poule, not merely one of them: the run writes both sides of every
  // fixture, and removeObsolete can delete a whole calendar.
  it('refuses a batch of poules when only one of them is the caller\'s', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'POST', '/games/import', { groupIds: [GROUP, OTHER_GROUP], pools: [] })
    expect(res.status).toBe(403)
  })

  it('does not refuse a poule the caller plays', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const res = await request(db, 'POST', '/games/import', { groupIds: [GROUP], pools: [] })
    expect(res.status).not.toBe(403)
  })

  const schedule = (over: Record<string, unknown> = {}) => ({
    schedules: [{
      seasonId: '30', phaseNumber: 1, divisionId: 'div-1', groupId: GROUP,
      teams: [], journees: [], ...over,
    }],
  })

  it('lets a club of the poule file a document into it', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    expect((await request(db, 'POST', '/schedule-documents/import', schedule())).status).not.toBe(403)
  })

  it('refuses a club that does not play it', async () => {
    const { db, writes } = fakeDb([outsideAdmin], 'ca3')
    expect((await request(db, 'POST', '/schedule-documents/import', schedule())).status).toBe(403)
    expect(wrote(writes)).toEqual([])
  })

  // A document that would mint a division or a poule is building the
  // competition's skeleton, which #576 says is a general admin's.
  it('refuses a club admin whose document would create a division', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const body = schedule({ divisionId: null, newDivisionLabel: 'GE 9' })
    expect((await request(db, 'POST', '/schedule-documents/import', body)).status).toBe(403)
  })

  it('refuses a club admin whose document would create a poule', async () => {
    const { db } = fakeDb([myAdmin], 'ca')
    const body = schedule({ groupId: null, newGroupNumber: 7 })
    expect((await request(db, 'POST', '/schedule-documents/import', body)).status).toBe(403)
  })

  it('lets a general admin create both', async () => {
    const { db } = fakeDb([generalAdmin], 'ga')
    const body = schedule({ divisionId: null, newDivisionLabel: 'GE 9', groupId: null, newGroupNumber: 7 })
    expect((await request(db, 'POST', '/schedule-documents/import', body)).status).not.toBe(403)
  })
})
