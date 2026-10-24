// @vitest-environment node
//
// `node:sqlite`, every migration: the answer is the person's, read from who
// signed in — a claim about the tables, not about statements.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #781 — Gilles has a profile at Rixheim and one at Landser, one person.
// Nathan manages Chloé's profiles.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'gilles-rix', firstName: 'Gilles', email: 'gilles@example.fr', personId: 'person-gilles' })
  addMember(d1.exec, { id: 'gilles-lan', firstName: 'Gilles', personId: 'person-gilles' })
  addMember(d1.exec, { id: 'nathan', firstName: 'Nathan', email: 'nathan@example.fr' })
  addMember(d1.exec, { id: 'chloe', firstName: 'Chloé', email: null })
  d1.exec("INSERT INTO person_delegates (person_id, delegate_id) VALUES ('person-chloe', 'person-nathan')")
  const signInAs = async (userId: string, originId?: string) => {
    d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at, origin_user_id) VALUES (?, ?, 0, ?, ?)',
      await sessionKey(`t-${userId}`), userId, Date.now() + 3_600_000, originId ?? null)
    return `t-${userId}`
  }
  const call = (token: string | null, body?: unknown) =>
    app.fetch(new Request('http://localhost/api/review-prompt', {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB: d1.db })
  const row = (personId: string) =>
    d1.db.prepare('SELECT * FROM review_prompts WHERE person_id = ?').bind(personId).first<Record<string, unknown>>()
  return { ...d1, signInAs, call, row }
}

describe('review prompt (#781)', () => {
  it('starts the clock on the first read, and keeps it', async () => {
    const w = world()
    const token = await w.signInAs('gilles-rix')
    const first = await (await w.call(token)).json() as { firstSeenAt: number; askedCount: number }
    expect(first.askedCount).toBe(0)
    w.exec("UPDATE review_prompts SET first_seen_at = 5 WHERE person_id = 'person-gilles'")
    expect((await (await w.call(token)).json() as { firstSeenAt: number }).firstSeenAt).toBe(5)
  })

  it('records an answer on the person, so it holds on their other club profile', async () => {
    const w = world()
    expect((await w.call(await w.signInAs('gilles-rix'), { event: 'declined' })).status).toBe(200)
    const fromLandser = await (await w.call(await w.signInAs('gilles-lan'))).json() as { stopped?: string; askedCount: number }
    expect(fromLandser).toMatchObject({ stopped: 'declined', askedCount: 1 })
  })

  it('answers for who signed in, never for the profile they manage', async () => {
    const w = world()
    // Nathan signed in, now on Chloé's profile.
    await w.call(await w.signInAs('chloe', 'nathan'), { event: 'reviewed' })
    expect(await w.row('person-nathan')).toMatchObject({ stopped: 'reviewed' })
    expect(await w.row('person-chloe')).toBeNull()
  })

  it('refuses an unknown event and a missing session', async () => {
    const w = world()
    expect((await w.call(await w.signInAs('nathan'), { event: 'loved-it' })).status).toBe(400)
    expect((await w.call(null)).status).toBe(401)
  })

  it('folds the record into the person kept when two people are merged', async () => {
    const w = world()
    addMember(w.exec, { id: 'admin', firstName: 'Admin', email: 'admin@example.fr', clubId: null, role: 'general_admin' })
    addMember(w.exec, { id: 'gilles-agr', firstName: 'Gilles', clubId: null, personId: 'person-gilles-agr' })
    w.exec(`INSERT INTO review_prompts (person_id, first_seen_at, asked_count, last_asked_at, stopped)
      VALUES ('person-gilles-agr', 10, 1, 20, 'declined'), ('person-gilles', 30, 0, NULL, NULL)`)
    const merged = await app.fetch(new Request('http://localhost/api/people/person-gilles-agr/merge-into', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await w.signInAs('admin')}` },
      body: JSON.stringify({ targetId: 'person-gilles' }),
    }), { DB: w.db })
    expect(merged.status).toBe(200)
    expect(await w.row('person-gilles')).toMatchObject({ first_seen_at: 10, asked_count: 1, last_asked_at: 20, stopped: 'declined' })
    expect(await w.row('person-gilles-agr')).toBeNull()
  })
})
