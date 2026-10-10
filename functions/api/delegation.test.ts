// @vitest-environment node
//
// `node:sqlite`: the routes write `person_delegates`, and what a row there
// opens is a join (reach.ts) — so the claims are about the table, read back.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #655 — who may create and withdraw a delegation: the person and the general
// admin, and the delegate may step down. Nobody else, club admins included.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'benjamin', firstName: 'Benjamin', email: 'henaut@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'sacha', firstName: 'Sacha', email: 'sacha@example.fr', clubId: 'club-a' })
  addMember(d1.exec, { id: 'nobody-email', firstName: 'Léo', email: null, clubId: 'club-a' })
  addMember(d1.exec, { id: 'ca', firstName: 'Claire', email: 'claire@example.fr', clubId: 'club-a', role: 'club_admin' })
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  const delegations = () =>
    d1.rows<{ person_id: string; delegate_id: string }>('SELECT person_id, delegate_id FROM person_delegates ORDER BY 1, 2')
  return { ...d1, delegations }
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (path: string, method = 'GET', body?: unknown) =>
    app.fetch(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { DB: d1.db },
    )
}

describe('naming a delegate (#655)', () => {
  it('lets the person name one by address, from « Mon compte »', async () => {
    const d1 = world()
    const sacha = await as(d1, 'sacha')
    const res = await sacha('/people/person-sacha/delegates', 'POST', { email: ' HENAUT@example.fr ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ delegate: { id: 'person-benjamin', firstName: 'Benjamin' } })
    expect(d1.delegations()).toEqual([{ person_id: 'person-sacha', delegate_id: 'person-benjamin' }])
  })

  it('lets the general admin name one for someone who cannot sign in, by member', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/people/person-nobody-email/delegates', 'POST', { delegateId: 'benjamin' })).status).toBe(200)
    expect(d1.delegations()).toEqual([{ person_id: 'person-nobody-email', delegate_id: 'person-benjamin' }])
  })

  it("refuses a club admin, even for their own club's member", async () => {
    const d1 = world()
    const ca = await as(d1, 'ca')
    expect((await ca('/people/person-sacha/delegates', 'POST', { delegateId: 'benjamin' })).status).toBe(403)
    expect(d1.delegations()).toEqual([])
  })

  it('refuses someone naming a delegate for another person', async () => {
    const d1 = world()
    const benjamin = await as(d1, 'benjamin')
    expect((await benjamin('/people/person-sacha/delegates', 'POST', { delegateId: 'benjamin' })).status).toBe(403)
  })

  it('says when no account has the address, or several do', async () => {
    const d1 = world()
    addMember(d1.exec, { id: 'twin', firstName: 'Bastien', email: 'henaut@example.fr', clubId: 'club-a' })
    const sacha = await as(d1, 'sacha')
    const none = await sacha('/people/person-sacha/delegates', 'POST', { email: 'inconnu@example.fr' })
    expect(none.status).toBe(404)
    expect(await none.json()).toMatchObject({ error: 'no_account' })
    const two = await sacha('/people/person-sacha/delegates', 'POST', { email: 'henaut@example.fr' })
    expect(two.status).toBe(409)
    expect(await two.json()).toMatchObject({ error: 'ambiguous' })
    expect(d1.delegations()).toEqual([])
  })

  it('refuses delegating to oneself', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/people/person-sacha/delegates', 'POST', { delegateId: 'sacha' })).status).toBe(400)
  })
})

describe('reading and withdrawing (#655)', () => {
  const delegated = async () => {
    const d1 = world()
    d1.exec("INSERT INTO person_delegates (person_id, delegate_id) VALUES ('person-sacha', 'person-benjamin')")
    return d1
  }

  it('shows each side what it gave and what it holds', async () => {
    const d1 = await delegated()
    const sacha = await as(d1, 'sacha')
    expect(await (await sacha('/people/person-sacha/delegations')).json()).toMatchObject({
      delegates: [{ id: 'person-benjamin' }], represents: [],
    })
    const benjamin = await as(d1, 'benjamin')
    expect(await (await benjamin('/people/person-benjamin/delegations')).json()).toMatchObject({
      delegates: [], represents: [{ id: 'person-sacha', firstName: 'Sacha' }],
    })
    expect((await benjamin('/people/person-sacha/delegations')).status).toBe(403)
  })

  it('lets the person withdraw it, and the delegate step down', async () => {
    const d1 = await delegated()
    const sacha = await as(d1, 'sacha')
    expect((await sacha('/people/person-sacha/delegates/person-benjamin', 'DELETE')).status).toBe(200)
    expect(d1.delegations()).toEqual([])

    d1.exec("INSERT INTO person_delegates (person_id, delegate_id) VALUES ('person-sacha', 'person-benjamin')")
    const benjamin = await as(d1, 'benjamin')
    expect((await benjamin('/people/person-sacha/delegates/person-benjamin', 'DELETE')).status).toBe(200)
    expect(d1.delegations()).toEqual([])
  })

  it('refuses anybody else, club admin included', async () => {
    const d1 = await delegated()
    const ca = await as(d1, 'ca')
    expect((await ca('/people/person-sacha/delegates/person-benjamin', 'DELETE')).status).toBe(403)
    expect(d1.delegations()).toHaveLength(1)
  })
})
