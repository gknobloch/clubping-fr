// @vitest-environment node
//
// `node:sqlite`: whether a profile was ever used is a question asked of ten
// tables, two of them through JSON arrays — so it runs against the real schema.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #733 — Vincent is Rambeau to the FFTT at Rixheim and Rambeaux to the AGR at
// Landser. « Ajouter à un autre club » from Landser left a third Vincent at
// Rixheim, under the FFTT number the first one already held.

const RIXHEIM = 'club-fftt-06680011'
const LANDSER = 'club-agr-680036'

function world() {
  const d1 = migratedD1()
  d1.exec(`INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
    ('${RIXHEIM}', '06680011', 'Rixheim PPA', 0), ('${LANDSER}', '', 'ASL Landser', 0)`)
  addMember(d1.exec, { id: 'vincent-rix', firstName: 'Vincent', lastName: 'Rambeau', email: 'v@example.fr', clubId: RIXHEIM })
  d1.exec("UPDATE users SET license_number = '6815464' WHERE id = 'vincent-rix'")
  addMember(d1.exec, { id: 'vincent-lan', firstName: 'Vincent', lastName: 'Rambeaux', clubId: LANDSER })
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  return d1
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (path: string, method: string, body?: unknown) =>
    app.fetch(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { DB: d1.db },
    )
}

describe('a licence already held in the receiving club (#733)', () => {
  it('refuses a second Rixheim profile under 6815464, and names the first', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga('/players/vincent-lan/profiles', 'POST', { clubId: RIXHEIM, licenseNumber: '6815464' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'licence_taken', id: 'vincent-rix' })
    expect(d1.rows(`SELECT id FROM users WHERE club_id = '${RIXHEIM}'`)).toEqual([{ id: 'vincent-rix' }])
  })

  it('refuses another federation’s licence held there too', async () => {
    const d1 = world()
    d1.exec("INSERT INTO federation_licences (user_id, federation_id, number) VALUES ('vincent-lan', 'agr', '857907')")
    addMember(d1.exec, { id: 'other', firstName: 'Paul', clubId: RIXHEIM })
    const ga = await as(d1, 'ga')
    const res = await ga('/players/other/profiles', 'POST', { clubId: LANDSER, licences: [{ federationId: 'agr', number: '857907' }] })
    expect(await res.json()).toMatchObject({ error: 'licence_taken', id: 'vincent-lan' })
  })
})

describe('deleting a profile nobody used (#733)', () => {
  it('deletes the profile, and its person when it was their only one', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/players/vincent-lan', 'DELETE')).status).toBe(200)
    expect(d1.rows("SELECT id FROM users WHERE id = 'vincent-lan'")).toEqual([])
    expect(d1.rows("SELECT id FROM people WHERE id = 'person-vincent-lan'")).toEqual([])
  })

  it('keeps the person when another profile is theirs', async () => {
    const d1 = world()
    addMember(d1.exec, { id: 'vincent-lan-2', firstName: 'Vincent', lastName: 'Rambeaux', clubId: RIXHEIM, personId: 'person-vincent-lan' })
    const ga = await as(d1, 'ga')
    expect((await ga('/players/vincent-lan-2', 'DELETE')).status).toBe(200)
    expect(d1.rows("SELECT id FROM people WHERE id = 'person-vincent-lan'")).toHaveLength(1)
  })

  it('refuses a profile with a past: signed in, in a roster, or answered', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    d1.exec("UPDATE users SET last_seen_at = 1 WHERE id = 'vincent-rix'")
    expect(await (await ga('/players/vincent-rix', 'DELETE')).json()).toMatchObject({ error: 'in_use' })
    d1.exec(`INSERT INTO teams (id, club_id, phase_id, number, group_id, player_ids) VALUES ('t', '${LANDSER}', 'p', 1, 'g', '["vincent-lan"]')`)
    expect((await ga('/players/vincent-lan', 'DELETE')).status).toBe(409)
    expect(d1.rows("SELECT id FROM users WHERE id = 'vincent-lan'")).toHaveLength(1)
  })

  it('is the general admin’s alone', async () => {
    const d1 = world()
    addMember(d1.exec, { id: 'ca', firstName: 'Lou', clubId: LANDSER, role: 'club_admin' })
    const ca = await as(d1, 'ca')
    expect((await ca('/players/vincent-lan', 'DELETE')).status).toBe(403)
  })
})
