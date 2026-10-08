import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'
import { sessionKey } from './auth'

// #643 — a second federation. Who may say what: a general admin decides which
// federation runs a competition, and changes it only while nothing is filed
// under it; a club declares its own affiliations, and nobody else's. The FFTT
// is never a club_federations row — its number is the club's own column.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const KEMBS = 'club-fftt-06680140'
const OTHER = 'club-fftt-06680011'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: KEMBS, first_login_at: null, last_seen_at: null,
  notifications_enabled: 1,
  notification_preferences: null,
  ...over,
})

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const kembsAdmin = member({ id: 'ca', role: 'club_admin' })
const otherAdmin = member({ id: 'ca2', role: 'club_admin', club_id: OTHER })
const player = member({ id: 'p1' })
const USERS = [generalAdmin, kembsAdmin, otherAdmin, player]

const FEDERATIONS = ['fftt', 'agr']
const CLUBS = [KEMBS, OTHER]

interface Write { sql: string; params: unknown[] }

/** Enough D1 for the guard and for the lookups these routes make. */
function fakeDb(viewerId: string, divisionsByCompetition: Record<string, string[]> = {}) {
  const writes: Write[] = []
  const answer = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM sessions')) {
      const key = await sessionKey(TOKEN)
      return params.includes(key) ? { token: key, user_id: viewerId, expires_at: Date.now() + HOUR } : null
    }
    if (sql.includes('FROM users WHERE id = ?')) return USERS.find((u) => u.id === params[0]) ?? null
    if (sql.includes('FROM federations WHERE id = ?')) {
      return FEDERATIONS.includes(params[0] as string) ? { id: params[0] } : null
    }
    if (sql.includes('FROM clubs WHERE id = ?')) return CLUBS.includes(params[0] as string) ? { id: params[0] } : null
    if (sql.includes('FROM divisions WHERE competition_id = ?')) {
      const ids = divisionsByCompetition[params[0] as string] ?? []
      return ids.length ? { id: ids[0] } : null
    }
    return null
  }
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        first: () => answer(sql, params),
        async all() { return { results: [] } },
        async run() { writes.push({ sql, params }); return { success: true } },
        __write: { sql, params },
      })
      return { ...bound([]), bind: (...params: unknown[]) => bound(params) }
    },
    async batch(stmts: { __write?: Write }[]) {
      for (const s of stmts) if (s.__write) writes.push(s.__write)
      return stmts.map(() => ({ success: true }))
    },
  } as unknown as D1Database
  return { db, writes }
}

const send = (db: D1Database, path: string, method: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { DB: db },
  )

const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error
const matching = (writes: Write[], pattern: RegExp) => writes.filter((w) => pattern.test(w.sql))

describe('POST /competitions — its federation (#643)', () => {
  it('files a competition under the federation named', async () => {
    const { db, writes } = fakeDb('ga')
    const res = await send(db, '/competitions', 'POST', { id: 'comp-agr', displayName: 'Championnat AGR', federationId: 'agr' })
    expect(res.status).toBe(200)
    const [insert] = matching(writes, /INSERT INTO competitions/)
    expect(insert.params.at(-1)).toBe('agr')
  })

  it('reads an absent federation as the FFTT, as every competition was', async () => {
    const { db, writes } = fakeDb('ga')
    await send(db, '/competitions', 'POST', { id: 'comp-x', displayName: 'X' })
    expect(matching(writes, /INSERT INTO competitions/)[0].params.at(-1)).toBe('fftt')
  })

  it('refuses a federation that does not exist, before writing anything', async () => {
    const { db, writes } = fakeDb('ga')
    const res = await send(db, '/competitions', 'POST', { id: 'comp-x', displayName: 'X', federationId: 'ufolep' })
    expect(res.status).toBe(400)
    expect(matching(writes, /competitions/)).toHaveLength(0)
  })
})

describe('PATCH /competitions/:id — changing federation (#643)', () => {
  it('moves a competition nothing is filed under', async () => {
    const { db, writes } = fakeDb('ga')
    const res = await send(db, '/competitions/comp-x', 'PATCH', { federationId: 'agr' })
    expect(res.status).toBe(200)
    const [update] = matching(writes, /UPDATE competitions/)
    expect(update.sql).toContain('federation_id = ?')
    expect(update.params).toEqual(['agr', 'comp-x'])
  })

  it('refuses once a division is filed under it — the whole calendar would move', async () => {
    const { db, writes } = fakeDb('ga', { 'comp-x': ['198609'] })
    const res = await send(db, '/competitions/comp-x', 'PATCH', { displayName: 'Y', federationId: 'agr' })
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('competition_has_divisions')
    expect(matching(writes, /UPDATE competitions/)).toHaveLength(0)
  })

  it('still lets a general admin rename one that holds divisions', async () => {
    const { db, writes } = fakeDb('ga', { 'comp-x': ['198609'] })
    expect((await send(db, '/competitions/comp-x', 'PATCH', { displayName: 'Y' })).status).toBe(200)
    expect(matching(writes, /UPDATE competitions/)[0].sql).not.toContain('federation_id')
  })

  it('is a general admin\'s decision', async () => {
    const { db, writes } = fakeDb('ca')
    expect((await send(db, '/competitions/comp-x', 'PATCH', { federationId: 'agr' })).status).toBe(403)
    expect(matching(writes, /UPDATE competitions/)).toHaveLength(0)
  })
})

describe('PUT /clubs/:clubId/affiliations/:federationId (#643)', () => {
  const body = { affiliationNumber: ' 680021 ', name: ' KEMBS ASL TT ' }

  it("lets a club declare its own affiliation, trimmed", async () => {
    const { db, writes } = fakeDb('ca')
    const res = await send(db, `/clubs/${KEMBS}/affiliations/agr`, 'PUT', body)
    expect(res.status).toBe(200)
    const [upsert] = matching(writes, /club_federations/)
    expect(upsert.sql).toContain('ON CONFLICT')
    expect(upsert.params).toEqual([KEMBS, 'agr', '680021', 'KEMBS ASL TT'])
  })

  it('stores a blank name as none — the club\'s own name stands', async () => {
    const { db, writes } = fakeDb('ga')
    await send(db, `/clubs/${KEMBS}/affiliations/agr`, 'PUT', { affiliationNumber: '680021', name: '  ' })
    expect(matching(writes, /club_federations/)[0].params[3]).toBeNull()
  })

  it("refuses another club's admin, and a player", async () => {
    for (const viewer of ['ca2', 'p1']) {
      const { db, writes } = fakeDb(viewer)
      expect((await send(db, `/clubs/${KEMBS}/affiliations/agr`, 'PUT', body)).status).toBe(403)
      expect(matching(writes, /club_federations/)).toHaveLength(0)
    }
  })

  it('refuses the FFTT, whose number is the club row itself', async () => {
    const { db, writes } = fakeDb('ga')
    expect((await send(db, `/clubs/${KEMBS}/affiliations/fftt`, 'PUT', body)).status).toBe(400)
    expect(matching(writes, /club_federations/)).toHaveLength(0)
  })

  it('answers 404 for an unknown federation or club', async () => {
    const { db, writes } = fakeDb('ga')
    expect((await send(db, `/clubs/${KEMBS}/affiliations/ufolep`, 'PUT', body)).status).toBe(404)
    expect((await send(db, '/clubs/club-nope/affiliations/agr', 'PUT', body)).status).toBe(404)
    expect(matching(writes, /club_federations/)).toHaveLength(0)
  })
})

describe('DELETE /clubs/:clubId/affiliations/:federationId (#643)', () => {
  it("lets a club leave a federation, and only its own", async () => {
    const own = fakeDb('ca')
    expect((await send(own.db, `/clubs/${KEMBS}/affiliations/agr`, 'DELETE')).status).toBe(200)
    expect(matching(own.writes, /DELETE FROM club_federations/)[0].params).toEqual([KEMBS, 'agr'])

    const other = fakeDb('ca2')
    expect((await send(other.db, `/clubs/${KEMBS}/affiliations/agr`, 'DELETE')).status).toBe(403)
    expect(matching(other.writes, /club_federations/)).toHaveLength(0)
  })
})

describe('POST /clubs and DELETE /clubs/:id carry the affiliations (#643)', () => {
  it('creates a club outside the FFTT with its affiliation, never an FFTT row', async () => {
    const { db, writes } = fakeDb('ga')
    const res = await send(db, '/clubs', 'POST', {
      id: 'club-agr-680036', affiliationNumber: '', displayName: 'Landser ASL', isArchived: false,
      affiliations: [
        { federationId: 'agr', affiliationNumber: '680036' },
        { federationId: 'fftt', affiliationNumber: '04680036' },
      ],
    })
    expect(res.status).toBe(200)
    const rows = matching(writes, /club_federations/)
    expect(rows).toHaveLength(1)
    expect(rows[0].params).toEqual(['club-agr-680036', '680036', null, 'agr'])
  })

  it('takes the affiliations with a deleted club', async () => {
    const { db, writes } = fakeDb('ga')
    await send(db, '/clubs/club-agr-680036', 'DELETE')
    expect(matching(writes, /DELETE FROM club_federations WHERE club_id = \?/)[0].params).toEqual(['club-agr-680036'])
  })
})
