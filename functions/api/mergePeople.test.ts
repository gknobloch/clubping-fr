// @vitest-environment node
//
// `node:sqlite`: a merge moves profiles and delegations between people, and
// what a profile then reaches is a join (reach.ts) — so the claims are about
// the tables, read back.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'
import { profileReaches } from './reach'

// #655 — one human, two people: Gilles plays at Rixheim and Landser, and his
// general admin profile was written without a name, so 0063 kept it apart.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'g-rix', firstName: 'Gilles', lastName: 'Knobloch', email: 'g@example.fr', clubId: 'club-a', personId: 'person-g' })
  addMember(d1.exec, { id: 'g-lan', firstName: 'Gilles', lastName: 'Knobloch', email: 'g@example.fr', clubId: 'club-b', personId: 'person-g' })
  addMember(d1.exec, { id: 'g-admin', firstName: '', lastName: '', email: 'G@example.fr', clubId: null, role: 'general_admin' })
  d1.exec("UPDATE people SET first_name = NULL, last_name = NULL, phone = '0611' WHERE id = 'person-g-admin'")
  addMember(d1.exec, { id: 'zoe', firstName: 'Zoé', lastName: 'Roy', email: 'zoe@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  // Zoé delegated to the admin profile's person before anyone noticed.
  d1.exec("INSERT INTO person_delegates (person_id, delegate_id, created_at) VALUES ('person-zoe', 'person-g-admin', 0)")
  return d1
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (personId: string, targetId: unknown) =>
    app.fetch(
      new Request(`http://localhost/api/people/${personId}/merge-into`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      }),
      { DB: d1.db },
    )
}

describe('merging two people who are one (#655)', () => {
  it('moves the profiles, keeps the target’s name and fills its blanks', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('person-g-admin', 'person-g')).status).toBe(200)
    expect(d1.rows("SELECT id, person_id FROM users WHERE id LIKE 'g-%' ORDER BY id")).toEqual([
      { id: 'g-admin', person_id: 'person-g' },
      { id: 'g-lan', person_id: 'person-g' },
      { id: 'g-rix', person_id: 'person-g' },
    ])
    expect(d1.rows("SELECT first_name, last_name, phone FROM people WHERE id = 'person-g'"))
      .toEqual([{ first_name: 'Gilles', last_name: 'Knobloch', phone: '0611' }])
    expect(d1.rows("SELECT id FROM people WHERE id = 'person-g-admin'")).toEqual([])
    // The mirror on the profiles agrees with the person (#655, step 1).
    expect(d1.rows("SELECT first_name, phone FROM users WHERE id = 'g-admin'"))
      .toEqual([{ first_name: 'Gilles', phone: '0611' }])
  })

  it('carries the delegations over, and opens the admin profile from a club one', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    await ga('person-g-admin', 'person-g')
    expect(d1.rows('SELECT person_id, delegate_id FROM person_delegates'))
      .toEqual([{ person_id: 'person-zoe', delegate_id: 'person-g' }])
    expect(await profileReaches(d1.db, 'g-rix', 'g-admin')).toBe(true)
  })

  it('refuses two people who share no address, and writes nothing', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga('person-zoe', 'person-g')
    expect(res.status).toBe(409)
    expect(d1.rows("SELECT person_id FROM users WHERE id = 'zoe'")).toEqual([{ person_id: 'person-zoe' }])
  })

  it('refuses anyone but the general admin, oneself and an unknown person', async () => {
    const d1 = world()
    expect((await (await as(d1, 'g-rix'))('person-g-admin', 'person-g')).status).toBe(403)
    const ga = await as(d1, 'ga')
    expect((await ga('person-g', 'person-g')).status).toBe(400)
    expect((await ga('person-g', 'person-nobody')).status).toBe(404)
    expect(d1.rows("SELECT id FROM people WHERE id = 'person-g-admin'")).toHaveLength(1)
  })
})
