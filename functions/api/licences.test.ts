import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'
import { sessionKey } from './auth'

// #644 — a licence per federation. The FFTT licence stays users.license_number;
// the others travel with POST / PATCH /players as a replacement, under the
// guards those routes already have (#558) — and never from "Mon compte".

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const LANDSER = 'club-agr-680036'
const OTHER = 'club-fftt-06680011'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: LANDSER, first_login_at: null, last_seen_at: null,
  notifications_enabled: 1,
  notification_preferences: null,
  ...over,
})

const landserAdmin = member({ id: 'ca', role: 'club_admin' })
const otherAdmin = member({ id: 'ca2', role: 'club_admin', club_id: OTHER })
const gilles = member({ id: 'p-gilles' })
/** Gilles at Rixheim, for the FFTT — the profile Landser copies. */
const gillesRixheim = member({
  id: 'p-gilles-rixheim', club_id: OTHER, email: 'gilles@club.fr', first_name: 'Gilles', last_name: 'Knobloch',
  license_number: '6810333', phone: '0799980001', birth_date: '1980-01-01', birth_place: 'Mulhouse',
})
const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const USERS = [landserAdmin, otherAdmin, gilles, gillesRixheim, generalAdmin]
const CLUBS = [LANDSER, OTHER]

interface Write { sql: string; params: unknown[] }

function fakeDb(viewerId: string, existingProfile?: string) {
  const writes: Write[] = []
  const answer = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM sessions')) {
      const key = await sessionKey(TOKEN)
      return params.includes(key) ? { token: key, user_id: viewerId, expires_at: Date.now() + HOUR } : null
    }
    if (sql.includes('FROM profiles WHERE id = ?')) return USERS.find((u) => u.id === params[0]) ?? null
    if (sql.includes('FROM clubs WHERE id = ?')) return CLUBS.includes(params[0] as string) ? { id: params[0] } : null
    if (sql.includes('FROM profiles WHERE club_id = ? AND email = ?')) return existingProfile ? { id: existingProfile } : null
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

const licenceWrites = (writes: Write[]) => writes.filter((w) => /federation_licences/.test(w.sql))

describe('PATCH /players/:id — licences (#644)', () => {
  it('replaces the licences outside the FFTT: clears, then writes what is named', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await send(db, '/players/p-gilles', 'PATCH', {
      licences: [{ federationId: 'agr', number: ' 1251178 ' }],
    })
    expect(res.status).toBe(200)
    const [clear, insert] = licenceWrites(writes)
    expect(clear.sql).toContain('DELETE FROM federation_licences WHERE user_id = ?')
    expect(clear.params).toEqual(['p-gilles'])
    expect(insert.sql).toContain('INSERT INTO federation_licences')
    expect(insert.params).toEqual(['p-gilles', '1251178', 'agr'])
  })

  it('drops an FFTT entry and a blank number — the FFTT licence is the user row', async () => {
    const { db, writes } = fakeDb('ca')
    await send(db, '/players/p-gilles', 'PATCH', {
      licences: [{ federationId: 'fftt', number: '6810333' }, { federationId: 'agr', number: '  ' }],
    })
    expect(licenceWrites(writes).map((w) => w.sql.trim().split(' ')[0])).toEqual(['DELETE'])
  })

  it("refuses another club's admin, writing nothing", async () => {
    const { db, writes } = fakeDb('ca2')
    const res = await send(db, '/players/p-gilles', 'PATCH', { licences: [{ federationId: 'agr', number: '1' }] })
    expect(res.status).toBe(403)
    expect(licenceWrites(writes)).toHaveLength(0)
  })

  // Not one of the four fields a member may change about themselves (#558):
  // a licence decides where somebody may play.
  it('refuses the member themselves, from "Mon compte"', async () => {
    const { db, writes } = fakeDb('p-gilles')
    const res = await send(db, '/players/p-gilles', 'PATCH', { licences: [{ federationId: 'agr', number: '1' }] })
    expect(res.status).toBe(403)
    expect(licenceWrites(writes)).toHaveLength(0)
  })

  it('leaves the licences alone when the patch does not name them', async () => {
    const { db, writes } = fakeDb('ca')
    await send(db, '/players/p-gilles', 'PATCH', { phone: '0799980000' })
    expect(licenceWrites(writes)).toHaveLength(0)
  })
})

describe('POST /players — licences (#644)', () => {
  it('creates a licensee of the AGR alone, with their AGR licence', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await send(db, '/players', 'POST', {
      id: 'p-new', firstName: 'Enzo', lastName: 'Lotz', licenseNumber: '', status: 'active', clubId: LANDSER,
      licences: [{ federationId: 'agr', number: '688786' }],
    })
    expect(res.status).toBe(200)
    expect(licenceWrites(writes).at(-1)!.params).toEqual(['p-new', '688786', 'agr'])
  })
})

describe('POST /players/:id/profiles — a profile in another club (#644)', () => {
  const body = { clubId: LANDSER, licences: [{ federationId: 'agr', number: '1251178' }] }
  const userInserts = (writes: Write[]) => writes.filter((w) => /INSERT INTO users/.test(w.sql))

  it('joins the source\'s person, and writes only the new club and its licences', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await send(db, '/players/p-gilles-rixheim/profiles', 'POST', body)
    expect(res.status).toBe(200)
    const { id } = await res.json() as { id: string }
    const [insert] = userInserts(writes)
    // id, licence, club, and the PERSON (#655) — nothing copied: the name and
    // the address are the person's. This source predates people, so it gets
    // one now, from its own row, and both profiles share it.
    expect(insert.params).toEqual([id, '', LANDSER, 'person-p-gilles-rixheim'])
    expect(writes.find((w) => /INSERT OR IGNORE INTO people/.test(w.sql))?.params).toEqual([
      'person-p-gilles-rixheim', 'Gilles', 'Knobloch', 'gilles@club.fr', '0799980001', '1980-01-01', 'Mulhouse',
    ])
    expect(writes.find((w) => /UPDATE users SET person_id/.test(w.sql))?.params)
      .toEqual(['person-p-gilles-rixheim', 'p-gilles-rixheim'])
    expect(licenceWrites(writes).at(-1)!.params).toEqual([id, '1251178', 'agr'])
  })

  it('is the receiving club\'s to decide: refused to another club\'s admin', async () => {
    const { db, writes } = fakeDb('ca2')
    expect((await send(db, '/players/p-gilles-rixheim/profiles', 'POST', body)).status).toBe(403)
    expect(userInserts(writes)).toHaveLength(0)
  })

  it('refuses the club the licensee is already in', async () => {
    const { db, writes } = fakeDb('ga')
    const res = await send(db, '/players/p-gilles-rixheim/profiles', 'POST', { clubId: OTHER })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('same_club')
    expect(userInserts(writes)).toHaveLength(0)
  })

  it('names the profile already there instead of making a second one', async () => {
    const { db, writes } = fakeDb('ca', 'p-already')
    const res = await send(db, '/players/p-gilles-rixheim/profiles', 'POST', body)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'already_in_club', id: 'p-already' })
    expect(userInserts(writes)).toHaveLength(0)
  })

  it('answers 404 for an unknown licensee or club', async () => {
    const { db, writes } = fakeDb('ga')
    expect((await send(db, '/players/nobody/profiles', 'POST', body)).status).toBe(404)
    expect((await send(db, '/players/p-gilles-rixheim/profiles', 'POST', { clubId: 'club-nope' })).status).toBe(404)
    expect(userInserts(writes)).toHaveLength(0)
  })
})
