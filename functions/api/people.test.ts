import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'
import { sessionKey } from './auth'

// #655 — a person behind every club profile. What describes the person (name,
// address, phone, birth) is shared by all their profiles: written once on the
// person and mirrored on each profile. On a person playing in two clubs, only
// the person and a general admin may change it; a person in one club stays the
// club admin's to correct, as since #600.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const RIXHEIM = 'club-fftt-06680011'
const LANDSER = 'club-agr-680036'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: RIXHEIM, first_login_at: null, last_seen_at: null,
  notifications_enabled: 1, notification_preferences: null, person_id: null,
  ...over,
})

const gilles = { email: 'gilles@club.fr', first_name: 'Gilles', last_name: 'Knobloch', phone: '0611', person_id: 'person-g' }
const gillesRixheim = member({ id: 'g-rix', ...gilles, license_number: '6810333' })
const gillesLandser = member({ id: 'g-lan', ...gilles, club_id: LANDSER })
const sam = member({ id: 'sam', email: 'sam@club.fr', first_name: 'Sam', last_name: 'Petit', phone: '0622', person_id: 'person-sam' })
const rixheimAdmin = member({ id: 'ca', role: 'club_admin', is_player: 0, person_id: 'person-ca' })
const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0, person_id: 'person-ga' })
const USERS = [gillesRixheim, gillesLandser, sam, rixheimAdmin, generalAdmin]

interface Write { sql: string; params: unknown[] }

function fakeDb(viewerId: string) {
  const writes: Write[] = []
  const first = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM sessions')) {
      const key = await sessionKey(TOKEN)
      return params.includes(key) ? { token: key, user_id: viewerId, expires_at: Date.now() + HOUR } : null
    }
    if (sql.includes('FROM users WHERE id = ?')) return USERS.find((u) => u.id === params[0]) ?? null
    return null
  }
  const all = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM users WHERE person_id = ?')) {
      const clubs = [...new Set(USERS.filter((u) => u.person_id === params[0]).map((u) => u.club_id))]
      return { results: clubs.map((club_id) => ({ club_id })) }
    }
    return { results: [] }
  }
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        first: () => first(sql, params),
        all: () => all(sql, params),
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

const patch = (db: D1Database, id: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost/api/players/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    }),
    { DB: db },
  )

/** The writes of the route — the guard's own last_seen_at refresh is not one. */
const routeWrites = (writes: Write[]) => writes.filter((w) => !/last_seen_at/.test(w.sql))

describe('PATCH /players/:id — the person behind the profile (#655)', () => {
  it("writes a person's phone on the person and mirrors it on every profile", async () => {
    const { db, writes } = fakeDb('ca')
    expect((await patch(db, 'sam', { phone: '0633' })).status).toBe(200)
    const [person, mirror] = routeWrites(writes)
    expect(person.sql).toContain('UPDATE people SET phone = ? WHERE id = ?')
    expect(person.params).toEqual(['0633', 'person-sam'])
    expect(mirror.sql).toContain('UPDATE users SET phone = ? WHERE person_id = ?')
    expect(mirror.params).toEqual(['0633', 'person-sam'])
  })

  it('refuses the admin of one club the person of a player in two', async () => {
    const { db, writes } = fakeDb('ca')
    expect((await patch(db, 'g-rix', { phone: '0699' })).status).toBe(403)
    expect(routeWrites(writes)).toHaveLength(0)
  })

  // The web form sends every field: unchanged ones are not a write to judge.
  it('still lets that admin correct the licence, the person sent back unchanged', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await patch(db, 'g-rix', {
      firstName: 'Gilles', lastName: 'Knobloch', email: 'gilles@club.fr', phone: '0611', licenseNumber: '6810334',
    })
    expect(res.status).toBe(200)
    const written = routeWrites(writes)
    expect(written).toHaveLength(1)
    expect(written[0].sql).toContain('UPDATE users SET license_number = ? WHERE id = ?')
    expect(written[0].params).toEqual(['6810334', 'g-rix'])
  })

  it('lets the person change their own address from either profile', async () => {
    const { db, writes } = fakeDb('g-lan')
    expect((await patch(db, 'g-rix', { email: 'gilles.k@club.fr' })).status).toBe(200)
    expect(routeWrites(writes).map((w) => w.params)).toEqual([
      ['gilles.k@club.fr', 'person-g'],
      ['gilles.k@club.fr', 'person-g'],
    ])
  })

  it('keeps a member to the four fields of « Mon compte », name excluded', async () => {
    const { db, writes } = fakeDb('g-lan')
    expect((await patch(db, 'g-rix', { firstName: 'Gil' })).status).toBe(403)
    expect(routeWrites(writes)).toHaveLength(0)
  })

  it('lets a general admin rename a person playing in two clubs', async () => {
    const { db, writes } = fakeDb('ga')
    expect((await patch(db, 'g-rix', { lastName: 'Knobloch-Muller' })).status).toBe(200)
    expect(routeWrites(writes)[0].params).toEqual(['Knobloch-Muller', 'person-g'])
  })
})
