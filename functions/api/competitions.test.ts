import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'

// #482 — the two halves of this feature have different owners, and the API is
// where that is decided rather than in the browser: a general admin says which
// competitions exist and which categories each admits, a club amends that for
// its own licensees only. The rule the amendments obey is pinned down in
// src/lib/competitionEligibility.spec.ts; what these tests check is that the
// routes ask it, refuse what they should, and write what they promise.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const CLUB = 'club-fftt-06680011'
const OTHER = 'club-fftt-06680105'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null, category: null,
  status: 'active', club_id: CLUB, first_login_at: null, last_seen_at: null,
  ...over,
})

interface CompetitionFixture {
  id: string
  categories: string
  is_category_locked: number
}

/**
 * Enough D1 for the guard (a session, then the viewer), for the player lookup
 * and for the competition lookup, recording every write.
 */
function fakeDb(
  users: UserRow[],
  competitions: CompetitionFixture[],
  viewerId: string | null,
) {
  const writes: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async first() {
          if (sql.includes('FROM sessions')) {
            return viewerId && params.includes(TOKEN)
              ? { token: TOKEN, user_id: viewerId, expires_at: Date.now() + HOUR }
              : null
          }
          if (sql.includes('FROM users WHERE id = ?')) {
            return users.find((u) => u.id === params[0]) ?? null
          }
          if (sql.includes('FROM competitions')) {
            return competitions.find((c) => c.id === params[0]) ?? null
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
        bind: (...params: unknown[]) => bound(params),
        async first() { return null },
        async all() { return { results: [] } },
        async run() { writes.push({ sql, params: [] }); return { success: true } },
      }
    },
    async batch(stmts: unknown[]) { return stmts.map(() => ({ success: true })) },
  } as unknown as D1Database
  return { db, writes }
}

/** A request signed in as `viewerId`, or with the local escape hatch. */
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

/** The writes this feature makes — the guard's own last_seen_at refresh is not one. */
const featureWrites = (writes: { sql: string }[]) =>
  writes.filter((w) => /competition/i.test(w.sql))

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const clubAdmin = member({ id: 'ca', role: 'club_admin' })
const otherClubAdmin = member({ id: 'ca2', role: 'club_admin', club_id: OTHER })
const cadet = member({ id: 'p-cadet', category: 'C1' })
const senior = member({ id: 'p-senior', category: 'S' })
const outsider = member({ id: 'p-outsider', club_id: OTHER, category: 'S' })

const youth: CompetitionFixture = { id: 'comp-jeunes', categories: '["P","B","M","C","J"]', is_category_locked: 1 }
const veterans: CompetitionFixture = { id: 'comp-veterans', categories: '["V50","V55"]', is_category_locked: 0 }

describe('competitions are a general admin\'s to create (#482)', () => {
  it('writes the name, the categories and the lock', async () => {
    const { db, writes } = fakeDb([generalAdmin], [], 'ga')
    const res = await send(db, '/competitions', 'POST', {
      id: 'comp-1', displayName: 'Championnat jeunes',
      categories: ['B', 'M', 'C'], isCategoryLocked: true, sortOrder: 2,
    })
    expect(res.status).toBe(200)
    const write = writes.find((w) => /INSERT INTO competitions/.test(w.sql))!
    expect(write.params).toEqual(['comp-1', 'Championnat jeunes', '["B","M","C"]', 1, 2, 0])
  })

  // The column is read back with jsonParseCategories, which drops what it does
  // not know — but a code that never reaches the column cannot be read at all.
  it('drops a category code that is not one of ours', async () => {
    const { db, writes } = fakeDb([generalAdmin], [], 'ga')
    await send(db, '/competitions', 'POST', {
      id: 'comp-1', displayName: 'X', categories: ['B', 'ZZZ', 42, 'V50'],
    })
    expect(writes.find((w) => /INSERT INTO competitions/.test(w.sql))!.params[2])
      .toBe('["B","V50"]')
  })

  it('refuses a club admin', async () => {
    const { db, writes } = fakeDb([clubAdmin], [], 'ca')
    const res = await send(db, '/competitions', 'POST', { id: 'c', displayName: 'X' })
    expect(res.status).toBe(403)
    expect(await errorOf(res)).toBe('not_allowed')
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a club admin the patch and the delete too', async () => {
    const { db } = fakeDb([clubAdmin], [youth], 'ca')
    expect((await send(db, '/competitions/comp-jeunes', 'PATCH', { displayName: 'X' })).status).toBe(403)
    expect((await send(db, '/competitions/comp-jeunes', 'DELETE')).status).toBe(403)
  })
})

describe('a club amends the default mapping for its own licensees', () => {
  it('records an exclusion', async () => {
    const { db, writes } = fakeDb([clubAdmin, cadet], [youth], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'excluded',
    })
    expect(res.status).toBe(200)
    const write = writes.find((w) => /INSERT INTO club_competition_eligibility/.test(w.sql))!
    expect(write.params).toEqual([CLUB, 'comp-jeunes', 'p-cadet', 'excluded'])
  })

  it('records an addition on a competition that is not locked', async () => {
    const { db, writes } = fakeDb([clubAdmin, senior], [veterans], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-veterans/eligibility`, 'PUT', {
      playerId: 'p-senior', effect: 'included',
    })
    expect(res.status).toBe(200)
    expect(writes.find((w) => /INSERT INTO club_competition_eligibility/.test(w.sql))!.params)
      .toEqual([CLUB, 'comp-veterans', 'p-senior', 'included'])
  })

  // The whole point of the lock: a youth championship does not admit a veteran
  // because a club asked nicely.
  it('refuses an addition out of category on a locked competition', async () => {
    const { db, writes } = fakeDb([clubAdmin, senior], [youth], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-senior', effect: 'included',
    })
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('competition_locked')
    expect(writes.filter((w) => /club_competition_eligibility/.test(w.sql))).toEqual([])
  })

  it('still lets a locked competition exclude one of its own', async () => {
    const { db, writes } = fakeDb([clubAdmin, cadet], [youth], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'excluded',
    })
    expect(res.status).toBe(200)
    expect(writes.some((w) => /INSERT INTO club_competition_eligibility/.test(w.sql))).toBe(true)
  })

  it("drops the row for 'default' — the third state is the absence of one", async () => {
    const { db, writes } = fakeDb([clubAdmin, cadet], [youth], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'default',
    })
    expect(res.status).toBe(200)
    const write = writes.find((w) => /DELETE FROM club_competition_eligibility/.test(w.sql))!
    expect(write.params).toEqual([CLUB, 'comp-jeunes', 'p-cadet'])
  })

  it('refuses a club admin writing on another club', async () => {
    const { db, writes } = fakeDb([otherClubAdmin, cadet], [youth], 'ca2')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'excluded',
    })
    expect(res.status).toBe(403)
    expect(featureWrites(writes)).toEqual([])
  })

  it('refuses a plain player', async () => {
    const { db } = fakeDb([cadet], [youth], 'p-cadet')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'excluded',
    })
    expect(res.status).toBe(403)
  })

  it('refuses a licensee who is not in the club named', async () => {
    const { db } = fakeDb([clubAdmin, outsider], [youth], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-outsider', effect: 'excluded',
    })
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toBe('not_in_club')
  })

  it('refuses an unknown effect', async () => {
    const { db } = fakeDb([clubAdmin, cadet], [youth], 'ca')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'peut-être',
    })
    expect(res.status).toBe(400)
  })

  it('lets a general admin write on any club', async () => {
    const { db, writes } = fakeDb([generalAdmin, cadet], [youth], 'ga')
    const res = await send(db, `/clubs/${CLUB}/competitions/comp-jeunes/eligibility`, 'PUT', {
      playerId: 'p-cadet', effect: 'excluded',
    })
    expect(res.status).toBe(200)
    expect(writes.some((w) => /INSERT INTO club_competition_eligibility/.test(w.sql))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The FFTT competitions import (#482)
// ---------------------------------------------------------------------------
//
// A competition is federation data like a club or a division: the same
// `contests` query the divisions import runs, minus its identifier filter,
// lists every championship an organisation runs. These tests pin down that the
// route asks FFTT rather than believing the caller, that it keys on the
// identifier, and that it stays a general admin's to run.

const CONTESTS = [
  { id: '/api/contests/18368', identifier: '1', name: 'FED_Championnat de France par Equipes Masculin' },
  { id: '/api/contests/18402', identifier: 'CJ', name: 'FED_Championnat Jeunes' },
]

function mockContests() {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ data: { contests: { edges: CONTESTS.map((node) => ({ node })) } } }), { status: 200 }),
  ))
}

/** A D1 holding `competitions`, enough for the preview and the import. */
function competitionsDb(rows: Array<{ id: string; display_name: string; fftt_contest_identifier: string | null }>) {
  const statement = (sql: string, params: unknown[]) => ({
    async first() {
      if (/FROM sessions/.test(sql)) return null
      if (/WHERE fftt_contest_identifier = \?/.test(sql)) {
        return rows.find((r) => r.fftt_contest_identifier === params[0]) ?? null
      }
      if (/MAX\(sort_order\)/.test(sql)) return { next: rows.length + 1 }
      if (/FROM competitions WHERE id = \?/.test(sql)) {
        const found = rows.find((r) => r.id === params[0])
        return found ? { ...found, categories: '[]', is_category_locked: 0, sort_order: 1, is_archived: 0 } : null
      }
      return null
    },
    async all() {
      return { results: /fftt_contest_identifier IS NOT NULL/.test(sql) ? rows.filter((r) => r.fftt_contest_identifier) : [] }
    },
    async run() {
      if (/INSERT INTO competitions/.test(sql)) {
        rows.push({
          id: params[0] as string,
          display_name: params[1] as string,
          fftt_contest_identifier: params[3] as string,
        })
      }
      return { success: true }
    },
  })
  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => statement(sql, params),
      ...statement(sql, []),
    }),
  } as unknown as D1Database
}

const previewCompetitions = (db: D1Database) =>
  app.fetch(
    new Request('http://localhost/api/fftt/competitions-preview?organizationId=14&seasonId=27'),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

const importCompetitions = (db: D1Database, body: unknown, env: Record<string, unknown> = { AUTH_GUARD_DISABLED: 'true' }) =>
  app.fetch(
    new Request('http://localhost/api/competitions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    }),
    { DB: db, ...env },
  )

afterEach(() => vi.unstubAllGlobals())

describe('GET /fftt/competitions-preview', () => {
  it('lists every championship FFTT runs, flagging the ones we hold', async () => {
    mockContests()
    const res = await previewCompetitions(competitionsDb([
      { id: 'comp-seniors', display_name: 'Championnat par équipes', fftt_contest_identifier: '1' },
    ]))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { competitions: Array<Record<string, unknown>> }
    expect(body.competitions).toEqual([
      // Ours is shown under the name we gave it, not FFTT's — a general admin
      // may well have renamed it.
      { identifier: '1', name: CONTESTS[0].name, exists: true, localName: 'Championnat par équipes' },
      { identifier: 'CJ', name: 'FED_Championnat Jeunes', exists: false },
    ])
  })

  it('refuses a scope that is not two numbers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/fftt/competitions-preview?organizationId=x&seasonId=27'),
      { DB: competitionsDb([]), AUTH_GUARD_DISABLED: 'true' },
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /competitions/import', () => {
  it('creates the ticked championships, open to every category', async () => {
    mockContests()
    const rows: Array<{ id: string; display_name: string; fftt_contest_identifier: string | null }> = []
    const res = await importCompetitions(competitionsDb(rows), {
      organizationId: 14, seasonId: 27, identifiers: ['CJ'],
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as { created: Array<{ displayName: string; categories: string[]; ffttContestIdentifier?: string }> }
    expect(body.created).toHaveLength(1)
    expect(body.created[0]).toMatchObject({
      displayName: 'FED_Championnat Jeunes',
      categories: [],
      ffttContestIdentifier: 'CJ',
    })
  })

  // The client says WHICH, never what they are called: the same rule the
  // divisions import follows.
  it('takes the name from FFTT, not from the caller', async () => {
    mockContests()
    const rows: Array<{ id: string; display_name: string; fftt_contest_identifier: string | null }> = []
    await importCompetitions(competitionsDb(rows), {
      organizationId: 14, seasonId: 27,
      identifiers: ['CJ'], names: { CJ: 'Ce que je veux' },
    })
    expect(rows[0].display_name).toBe('FED_Championnat Jeunes')
  })

  it('ignores an identifier FFTT does not run', async () => {
    mockContests()
    const rows: Array<{ id: string; display_name: string; fftt_contest_identifier: string | null }> = []
    const res = await importCompetitions(competitionsDb(rows), {
      organizationId: 14, seasonId: 27, identifiers: ['ZZZ'],
    })
    expect(res.status).toBe(200)
    expect(rows).toEqual([])
  })

  it('skips one we already hold rather than creating a second', async () => {
    mockContests()
    const rows = [{ id: 'comp-seniors', display_name: 'Championnat par équipes', fftt_contest_identifier: '1' }]
    const res = await importCompetitions(competitionsDb(rows), {
      organizationId: 14, seasonId: 27, identifiers: ['1'],
    })
    const body = (await res.json()) as { created: unknown[]; skipped: Array<{ identifier: string }> }
    expect(body.created).toEqual([])
    expect(body.skipped).toEqual([{ identifier: '1', name: CONTESTS[0].name }])
    expect(rows).toHaveLength(1)
  })

  it('refuses a club admin', async () => {
    mockContests()
    const { db } = fakeDb([clubAdmin], [], 'ca')
    const res = await importCompetitions(db, { organizationId: 14, seasonId: 27, identifiers: ['1'] }, {})
    expect(res.status).toBe(403)
  })

  it('refuses an empty or malformed selection', async () => {
    mockContests()
    expect((await importCompetitions(competitionsDb([]), { organizationId: 14, seasonId: 27, identifiers: [] })).status).toBe(400)
    expect((await importCompetitions(competitionsDb([]), { organizationId: 14, seasonId: 27, identifiers: ['a"b'] })).status).toBe(400)
  })
})
