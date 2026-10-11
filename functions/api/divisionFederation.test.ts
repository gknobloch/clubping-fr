// @vitest-environment node
//
// `node:sqlite`, every migration: a division's phase and its competition are
// one federation's (#645), checked by the API and repaired by 0072.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('27', '2026/2027', 'active')")
  d1.exec(`INSERT INTO phases (id, season_id, name, display_name, status, federation_id) VALUES
    ('phase-27-1', '27', 'Phase 1', '2026/2027 Phase 1', 'active', 'fftt'),
    ('phase-agr-27-1', '27', 'Phase 1', '2026/2027 Phase 1', 'active', 'agr')`)
  d1.exec(`INSERT INTO competitions (id, display_name, federation_id) VALUES
    ('comp-fftt', 'Championnat de France', 'fftt'), ('comp-agr', 'Championnat du Haut-Rhin', 'agr')`)
  return d1
}

async function as(d1: ReturnType<typeof world>) {
  const token = 'token-ga'
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), 'ga', Date.now() + 3_600_000)
  return (path: string, method: string, body: unknown) =>
    app.fetch(new Request(`http://localhost/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    }), { DB: d1.db })
}

const division = (id: string, phaseId: string, competitionId: string | null) =>
  ({ id, phaseId, displayName: id, rank: 1, playersPerGame: 4, isArchived: false, competitionId })

describe('a division’s phase and competition are one federation’s (#645)', () => {
  it('refuses an AGR championship in the FFTT’s phase, and the other way round', async () => {
    const d1 = world()
    const ga = await as(d1)
    const refused = await ga('/divisions', 'POST', division('exc', 'phase-27-1', 'comp-agr'))
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ error: 'federation_mismatch' })
    expect((await ga('/divisions', 'POST', division('ge1', 'phase-agr-27-1', 'comp-fftt'))).status).toBe(400)
    // No competition is the FFTT's (#643): fine in its phase, not in the AGR's.
    expect((await ga('/divisions', 'POST', division('free', 'phase-agr-27-1', null))).status).toBe(400)
    expect((await ga('/divisions', 'POST', division('free', 'phase-27-1', null))).status).toBe(200)
    expect((await ga('/divisions', 'POST', division('exc', 'phase-agr-27-1', 'comp-agr'))).status).toBe(200)
    expect(d1.rows('SELECT id FROM divisions ORDER BY id')).toEqual([{ id: 'exc' }, { id: 'free' }])
  })

  it('refuses a change that would split them, and allows one that keeps them together', async () => {
    const d1 = world()
    const ga = await as(d1)
    await ga('/divisions', 'POST', division('exc', 'phase-agr-27-1', 'comp-agr'))
    expect((await ga('/divisions/exc', 'PATCH', { competitionId: 'comp-fftt' })).status).toBe(400)
    expect((await ga('/divisions/exc', 'PATCH', { phaseId: 'phase-27-1' })).status).toBe(400)
    expect((await ga('/divisions/exc', 'PATCH', { displayName: 'Excellence' })).status).toBe(200)
  })

  it('moves a division already misfiled to its federation’s phase — unless poules hang from it (0072)', () => {
    const d1 = world()
    d1.exec(`INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, competition_id) VALUES
      ('exc', 'phase-27-1', 'Excellence', 1, 4, 0, 'comp-agr'),
      ('hon', 'phase-27-1', 'Honneur', 2, 4, 0, 'comp-agr'),
      ('ge1', 'phase-27-1', 'GE 1', 1, 4, 0, 'comp-fftt')`)
    d1.exec("INSERT INTO groups (id, division_id, number, team_ids, is_archived) VALUES ('g-hon', 'hon', 1, '[]', 0)")
    const sql = readFileSync(join(__dirname, '../../migrations/0072_division_phase_federation.sql'), 'utf8')
      .split('\n').filter((l) => !l.startsWith('--')).join('\n')
    d1.exec(sql)
    expect(d1.rows('SELECT id, phase_id FROM divisions ORDER BY id')).toEqual([
      { id: 'exc', phase_id: 'phase-agr-27-1' },
      { id: 'ge1', phase_id: 'phase-27-1' },
      { id: 'hon', phase_id: 'phase-27-1' },
    ])
  })
})
