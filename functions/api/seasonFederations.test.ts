// @vitest-environment node
//
// `node:sqlite`, every migration: activation is a set of UPDATEs across
// seasons and phases, scoped by a join — the claims are about the rows.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #645 — one active season and phase in EACH federation.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  addMember(d1.exec, { id: 'ca', firstName: 'Claire', email: 'claire@example.fr', clubId: 'club-a', role: 'club_admin' })
  d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('27', '2026/2027', 'active')")
  d1.exec("INSERT INTO seasons (id, display_name, status, federation_id) VALUES ('agr-27', '2026/2027', 'active', 'agr')")
  for (const [id, season, name, status] of [
    ['phase-27-1', '27', 'Phase 1', 'active'], ['phase-27-2', '27', 'Phase 2', 'upcoming'],
    ['phase-agr-27-1', 'agr-27', 'Phase 1', 'active'], ['phase-agr-27-2', 'agr-27', 'Phase 2', 'upcoming'],
  ]) d1.exec('INSERT INTO phases (id, season_id, name, display_name, status) VALUES (?, ?, ?, ?, ?)', id, season, name, name, status)
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

describe('seasons and phases per federation (#645)', () => {
  it('activates the AGR phase 2 without touching the FFTT phase 1', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/phases/phase-agr-27-2', 'PATCH', { status: 'active' })).status).toBe(200)
    expect(d1.phases()).toEqual({
      'phase-27-1': 'active', 'phase-27-2': 'upcoming', 'phase-agr-27-1': 'archived', 'phase-agr-27-2': 'active',
    })
    expect(d1.seasons()).toEqual({ 27: 'active', 'agr-27': 'active' })
  })

  it('creates an AGR season under its own id, and demotes only the AGR one', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga('/seasons', 'POST', { displayName: '2027/2028', status: 'active', federationId: 'agr' })
    expect(await res.json()).toEqual({ id: 'agr-28', displayName: '2027/2028', status: 'active', federationId: 'agr' })
    expect(d1.seasons()).toEqual({ 27: 'active', 'agr-27': 'archived', 'agr-28': 'active' })
    // The new season has no phase yet: the AGR has none active, the FFTT keeps its own.
    expect(d1.phases()['phase-27-1']).toBe('active')
    expect(d1.phases()['phase-agr-27-1']).toBe('archived')
  })

  it('keeps an FFTT season creation as it was — the federation unsaid is the FFTT', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect(await (await ga('/seasons', 'POST', { displayName: '2027/2028', status: 'active' })).json())
      .toMatchObject({ id: '28', federationId: 'fftt' })
    expect(d1.seasons()).toEqual({ 27: 'archived', 28: 'active', 'agr-27': 'active' })
  })

  it('refuses an unknown federation', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga('/seasons', 'POST', { displayName: '2027/2028', federationId: 'xyz' })).status).toBe(400)
  })

  it('carries the federation of each season in /data', async () => {
    const d1 = world()
    const ca = await as(d1, 'ca')
    const data = await (await ca('/data', 'GET')).json() as { seasons: Array<{ id: string; federationId: string }> }
    expect(data.seasons.map((s) => [s.id, s.federationId]).sort()).toEqual([['27', 'fftt'], ['agr-27', 'agr']])
  })
})
