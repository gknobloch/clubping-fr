// @vitest-environment node
//
// `node:sqlite`: the rule reads `people`, and the claim is about what reaches
// the tables.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #655, 4 bis — one address, one person: a second person on an address is
// refused, whether created or edited onto it.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'benjamin', firstName: 'Benjamin', email: 'henaut@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'g-rix', firstName: 'Gilles', email: 'g@example.fr', clubId: 'club-a', personId: 'person-g' })
  addMember(d1.exec, { id: 'g-lan', firstName: 'Gilles', email: 'g@example.fr', clubId: 'club-b', personId: 'person-g' })
  // A pair from before the rule, not yet settled by the general admin.
  addMember(d1.exec, { id: 'sacha', firstName: 'Sacha', email: 'henaut@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  return d1
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (path: string, method: string, body: unknown) =>
    app.fetch(new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }), { DB: d1.db })
}

const newcomer = (email: string) => ({
  id: 'lou', firstName: 'Lou', lastName: 'Henaut', email, licenseNumber: '', phone: '', status: 'active', clubId: 'club-a',
})

describe('one address, one person (#655, 4 bis)', () => {
  it('refuses to create a licensee under another person’s address, and writes nothing', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga('/players', 'POST', newcomer(' Henaut@example.fr '))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'address_taken', message: expect.stringContaining('Benjamin Henaut') })
    expect(d1.rows("SELECT id FROM users WHERE id = 'lou'")).toEqual([])
    expect(d1.rows("SELECT id FROM people WHERE id = 'person-lou'")).toEqual([])
  })

  it('creates one with an address of their own, or none', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/players', 'POST', newcomer(''))).status).toBe(200)
    expect((await ga('/players', 'POST', { ...newcomer('lou@example.fr'), id: 'lou2' })).status).toBe(200)
  })

  it('refuses to move a member onto another person’s address', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga('/players/g-rix', 'PATCH', { email: 'henaut@example.fr' })
    expect(res.status).toBe(409)
    expect(d1.rows("SELECT email FROM people WHERE id = 'person-g'")).toEqual([{ email: 'g@example.fr' }])
  })

  it('lets a person keep an address their other profile already has', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/players/g-lan', 'PATCH', { email: 'G@example.fr' })).status).toBe(200)
  })

  it('does not refuse a form sent back unchanged on a pair the general admin has yet to settle', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/players/sacha', 'PATCH', { email: 'henaut@example.fr', phone: '0611' })).status).toBe(200)
  })
})
