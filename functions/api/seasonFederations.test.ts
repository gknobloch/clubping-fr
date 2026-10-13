// @vitest-environment node
//
// `node:sqlite`, every migration: activation is a set of UPDATEs across
// seasons and phases, scoped by federation — the claims are about the rows.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #645 — ONE season for every federation, and one active phase in EACH.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  addMember(d1.exec, { id: 'ca', firstName: 'Claire', email: 'claire@example.fr', clubId: 'club-a', role: 'club_admin' })
  d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('27', '2026/2027', 'active')")
  for (const [id, name, status, federation] of [
    ['phase-27-1', 'Phase 1', 'active', 'fftt'], ['phase-27-2', 'Phase 2', 'upcoming', 'fftt'],
    ['phase-agr-27-1', 'Phase 1', 'active', 'agr'], ['phase-agr-27-2', 'Phase 2', 'upcoming', 'agr'],
  ]) {
    d1.exec('INSERT INTO phases (id, season_id, name, display_name, status, federation_id) VALUES (?, ?, ?, ?, ?, ?)',
      id, '27', name, name, status, federation)
  }
  const phases = () => Object.fromEntries(d1.rows<{ id: string; status: string }>('SELECT id, status FROM phases').map((r) => [r.id, r.status]))
  const seasons = () => Object.fromEntries(d1.rows<{ id: string; status: string }>('SELECT id, status FROM seasons').map((r) => [r.id, r.status]))
  return { ...d1, phases, seasons }
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (path: string, method: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB: d1.db })
}

describe('one season, phases per federation (#645)', () => {
  it('activates the AGR phase 2 without touching the FFTT phase 1', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/phases/phase-agr-27-2', 'PATCH', { status: 'active' })).status).toBe(200)
    expect(d1.phases()).toEqual({
      'phase-27-1': 'active', 'phase-27-2': 'upcoming', 'phase-agr-27-1': 'archived', 'phase-agr-27-2': 'active',
    })
    expect(d1.seasons()).toEqual({ 27: 'active' })
  })

  it('creates a season for everybody — no federation to give —, and moves each federation onto it', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect(await (await ga('/seasons', 'POST', { displayName: '2027/2028', status: 'active' })).json())
      .toEqual({ id: '28', displayName: '2027/2028', status: 'active' })
    expect(d1.seasons()).toEqual({ 27: 'archived', 28: 'active' })
    // No phase in 2027/2028 yet: neither federation keeps an active one.
    expect(d1.phases()['phase-27-1']).toBe('archived')
    expect(d1.phases()['phase-agr-27-1']).toBe('archived')
  })

  it('creates an AGR phase in the shared season, under the AGR’s id', async () => {
    const d1 = world()
    d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('28', '2027/2028', 'upcoming')")
    const ga = await as(d1, 'ga')
    const res = await ga('/phases', 'POST', {
      id: 'ignored', seasonId: '28', name: 'Phase 1', displayName: '2027/2028 Phase 1', status: 'active', federationId: 'agr',
    })
    expect(res.status).toBe(200)
    expect(d1.rows("SELECT id, season_id, federation_id FROM phases WHERE season_id = '28'"))
      .toEqual([{ id: 'phase-agr-28-1', season_id: '28', federation_id: 'agr' }])
    // Its season becomes the active one; the FFTT's phase of 2026/2027 follows
    // it out, having none in 2027/2028.
    expect(d1.seasons()).toEqual({ 27: 'archived', 28: 'active' })
    expect(d1.phases()).toMatchObject({ 'phase-agr-28-1': 'active', 'phase-agr-27-1': 'archived', 'phase-27-1': 'archived' })
  })

  it('lets two federations hold a Phase 1 in one season, but not one federation twice', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const body = { seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1' }
    expect((await ga('/phases', 'POST', { ...body, federationId: 'agr' })).status).toBe(409)
    expect((await ga('/phases', 'POST', { ...body, federationId: 'xyz' })).status).toBe(400)
  })

  it('lists the FFTT’s phases first, which is the active phase an app up to 1.7.0 opens on (#724)', async () => {
    const d1 = world()
    // The AGR's phase 1 created before the FFTT's phase 2, which then becomes active.
    d1.exec("DELETE FROM phases WHERE id = 'phase-27-2'")
    d1.exec("UPDATE phases SET status = 'archived' WHERE id = 'phase-27-1'")
    d1.exec("INSERT INTO phases (id, season_id, name, display_name, status, federation_id) VALUES ('phase-27-2', '27', 'Phase 2', 'Phase 2', 'active', 'fftt')")
    const ca = await as(d1, 'ca')
    const data = await (await ca('/data', 'GET')).json() as { phases: Array<{ id: string; status: string }> }
    // What an old app does: the first active phase.
    expect(data.phases.find((p) => p.status === 'active')?.id).toBe('phase-27-2')
    expect(data.phases.map((p) => p.id)).toEqual(['phase-27-1', 'phase-27-2', 'phase-agr-27-1', 'phase-agr-27-2'])
  })

  it('carries the federation of each phase in /data, and none on a season', async () => {
    const d1 = world()
    const ca = await as(d1, 'ca')
    const data = await (await ca('/data', 'GET')).json() as {
      seasons: Array<Record<string, unknown>>; phases: Array<{ id: string; federationId: string }>
    }
    expect(data.seasons).toEqual([{ id: '27', displayName: '2026/2027', status: 'active' }])
    expect(data.phases.map((p) => [p.id, p.federationId]).sort()).toEqual([
      ['phase-27-1', 'fftt'], ['phase-27-2', 'fftt'], ['phase-agr-27-1', 'agr'], ['phase-agr-27-2', 'agr'],
    ])
  })
})
