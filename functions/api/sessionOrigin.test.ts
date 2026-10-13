// @vitest-environment node
//
// `node:sqlite`, every migration: who a session may become is read from the
// `sessions` row it carries — a claim about the table, not about statements.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #702 — Chloé delegated to Nathan. Nathan opens Chloé's profile, and must be
// able to come back to his own without signing out; and one level only: from
// Chloé's, he does not reach whoever delegated to Chloé.

type AuthBody = { token: string; user: { id: string }; profiles: Array<{ id: string }> }

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'nathan', firstName: 'Nathan', email: 'famille@example.fr' })
  addMember(d1.exec, { id: 'chloe', firstName: 'Chloé', email: null })
  addMember(d1.exec, { id: 'lea', firstName: 'Léa', email: null })
  d1.exec(`INSERT INTO person_delegates (person_id, delegate_id) VALUES
    ('person-chloe', 'person-nathan'), ('person-lea', 'person-chloe')`)
  const call = (path: string, token: string | null, body?: unknown) =>
    app.fetch(new Request(`http://localhost/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB: d1.db })
  const signInAs = async (userId: string) => {
    d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
      await sessionKey(`t-${userId}`), userId, Date.now() + 3_600_000)
    return `t-${userId}`
  }
  const ids = (b: AuthBody) => b.profiles.map((p) => p.id).sort()
  return { ...d1, call, signInAs, ids }
}

describe('a delegate comes back to their own profile (#702)', () => {
  it('offers Nathan back from Chloé’s profile, and lets him switch to it', async () => {
    const w = world()
    const asNathan = await w.signInAs('nathan')
    const toChloe = await w.call('/switch', asNathan, { userId: 'chloe' })
    expect(toChloe.status).toBe(200)
    const chloe = await toChloe.json() as AuthBody
    expect(chloe.user.id).toBe('chloe')
    expect(w.ids(chloe)).toEqual(['chloe', 'nathan'])

    // A reload reads the same list from the session.
    expect(w.ids(await (await w.call('/me', chloe.token)).json() as AuthBody)).toEqual(['chloe', 'nathan'])

    const back = await w.call('/switch', chloe.token, { userId: 'nathan' })
    expect(back.status).toBe(200)
    expect((await back.json() as AuthBody).user.id).toBe('nathan')
  })

  it('keeps it one level: as Chloé, Nathan does not reach who delegated to Chloé', async () => {
    const w = world()
    const chloe = await (await w.call('/switch', await w.signInAs('nathan'), { userId: 'chloe' })).json() as AuthBody
    expect((await w.call('/switch', chloe.token, { userId: 'lea' })).status).toBe(403)
    // Chloé signed in herself still does.
    expect((await w.call('/switch', await w.signInAs('chloe'), { userId: 'lea' })).status).toBe(200)
  })

  it('remembers Nathan when his own code opens Chloé’s profile — the one he used last', async () => {
    const w = world()
    w.exec("UPDATE users SET last_seen_at = 2000000000000 WHERE id = 'chloe'")
    const { devCode } = await (await w.call('/email/request', null, { email: 'famille@example.fr' })).json() as { devCode: string }
    const signedIn = await (await w.call('/email/verify', null, { email: 'famille@example.fr', code: devCode })).json() as AuthBody
    expect(signedIn.user.id).toBe('chloe')
    expect(w.ids(signedIn)).toEqual(['chloe', 'nathan'])
    expect((await w.call('/switch', signedIn.token, { userId: 'nathan' })).status).toBe(200)
  })
})
