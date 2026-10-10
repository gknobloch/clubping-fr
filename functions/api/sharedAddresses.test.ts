// @vitest-environment node
//
// `node:sqlite`: the route empties an address on a person and on every profile
// mirroring it, and what still opens what is a join (reach.ts) — so the claims
// are about the tables, read back.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'
import { profileReaches } from './reach'

// #655, step 3 — Sacha shares Benjamin's address: make Benjamin Sacha's
// delegate. The general admin's gesture, and nobody else's.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'benjamin', firstName: 'Benjamin', email: 'henaut@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'sacha', firstName: 'Sacha', email: 'Henaut@example.fr', clubId: 'club-a' })
  // Sacha plays in a second club too: both profiles mirror the address.
  addMember(d1.exec, { id: 'sacha-b', firstName: 'Sacha', email: 'Henaut@example.fr', clubId: 'club-b', personId: 'person-sacha' })
  addMember(d1.exec, { id: 'zoe', firstName: 'Zoé', lastName: 'Roy', email: 'zoe@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'ca', firstName: 'Claire', email: 'claire@example.fr', clubId: 'club-a', role: 'club_admin' })
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  const addresses = () => ({
    people: d1.rows<{ id: string; email: string | null }>("SELECT id, email FROM people WHERE id IN ('person-benjamin', 'person-sacha') ORDER BY id"),
    users: d1.rows<{ id: string; email: string | null }>("SELECT id, email FROM users WHERE id IN ('benjamin', 'sacha', 'sacha-b') ORDER BY id"),
  })
  const delegations = () =>
    d1.rows<{ person_id: string; delegate_id: string }>('SELECT person_id, delegate_id FROM person_delegates ORDER BY 1, 2')
  return { ...d1, addresses, delegations }
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (personId: string, delegateId: unknown) =>
    app.fetch(
      new Request(`http://localhost/api/people/${personId}/address-to-delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ delegateId }),
      }),
      { DB: d1.db },
    )
}

describe('settling a shared address (#655)', () => {
  it('empties the address of the person and of every profile of theirs, and names the delegate', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('person-sacha', 'person-benjamin')).status).toBe(200)
    expect(d1.addresses()).toEqual({
      people: [{ id: 'person-benjamin', email: 'henaut@example.fr' }, { id: 'person-sacha', email: null }],
      users: [
        { id: 'benjamin', email: 'henaut@example.fr' },
        { id: 'sacha', email: null },
        { id: 'sacha-b', email: null },
      ],
    })
    expect(d1.delegations()).toEqual([{ person_id: 'person-sacha', delegate_id: 'person-benjamin' }])
  })

  it('leaves Benjamin opening every profile of Sacha’s — through the delegation now', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    await ga('person-sacha', 'person-benjamin')
    expect(await profileReaches(d1.db, 'benjamin', 'sacha')).toBe(true)
    expect(await profileReaches(d1.db, 'benjamin', 'sacha-b')).toBe(true)
    // One way: a delegation is not a shared address.
    expect(await profileReaches(d1.db, 'sacha', 'benjamin')).toBe(false)
  })

  it('refuses when the two no longer share an address, and writes nothing', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga('person-zoe', 'person-benjamin')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'not_shared' })
    expect(d1.delegations()).toEqual([])
  })

  it('refuses anyone but the general admin — the person and their club admin included', async () => {
    const d1 = world()
    expect((await (await as(d1, 'ca'))('person-sacha', 'person-benjamin')).status).toBe(403)
    expect((await (await as(d1, 'sacha'))('person-sacha', 'person-benjamin')).status).toBe(403)
    expect(d1.addresses().people[1].email).toBe('Henaut@example.fr')
    expect(d1.delegations()).toEqual([])
  })

  it('refuses oneself, an unknown person and a missing delegate', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('person-sacha', 'person-sacha')).status).toBe(400)
    expect((await ga('person-sacha', 'person-nobody')).status).toBe(404)
    expect((await ga('person-sacha', undefined)).status).toBe(400)
  })
})
