// @vitest-environment node
//
// `node:sqlite`, every migration, and D1's refusal of a statement bound with
// the wrong number of values (migratedD1.testkit): the cascading deletes of
// #291 answered 500 on D1 for months — `teamGameIds` repeats a subquery that
// takes a value, and bound it once — while their statement-fake tests passed.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

async function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  d1.exec("INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES ('c1', '', 'Rixheim', 0), ('c2', '', 'Kembs', 0)")
  d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('26', '2025/2026', 'archived')")
  d1.exec("INSERT INTO phases (id, season_id, name, display_name, status) VALUES ('phase-26-1', '26', 'Phase 1', '2025/2026 Phase 1', 'archived')")
  d1.exec("INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived) VALUES ('d1', 'phase-26-1', 'GE 1', 1, 4, 1)")
  d1.exec(`INSERT INTO groups (id, division_id, number, team_ids, is_archived) VALUES ('g1', 'd1', 1, '["t1","t2"]', 0)`)
  d1.exec(`INSERT INTO teams (id, club_id, phase_id, number, group_id) VALUES
    ('t1', 'c1', 'phase-26-1', 1, 'g1'), ('t2', 'c2', 'phase-26-1', 1, 'g1')`)
  d1.exec("INSERT INTO match_days (id, group_id, number, date) VALUES ('md1', 'g1', 1, '2025-10-01')")
  d1.exec("INSERT INTO games (id, match_day_id, home_team_id, away_team_id) VALUES ('gm1', 'md1', 't1', 't2')")
  d1.exec("INSERT INTO game_selections (game_id, team_id, player_ids) VALUES ('gm1', 't1', '[]')")
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey('token-ga'), 'ga', Date.now() + 3_600_000)
  const del = (path: string) => app.fetch(new Request(`http://localhost/api${path}`, {
    method: 'DELETE', headers: { Authorization: 'Bearer token-ga' },
  }), { DB: d1.db })
  const count = (table: string) => d1.rows<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)[0].n
  return { ...d1, del, count }
}

describe('cascading deletes (#291) — on a D1 that counts its bindings', () => {
  it('deletes a division with its poule, teams, journées, matches and line-ups', async () => {
    const d1 = await world()
    expect((await d1.del('/divisions/d1')).status).toBe(200)
    expect(['divisions', 'groups', 'teams', 'match_days', 'games', 'game_selections'].map(d1.count)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('deletes a phase, and a season, the same way', async () => {
    const d1 = await world()
    expect((await d1.del('/phases/phase-26-1')).status).toBe(200)
    expect(['phases', 'divisions', 'teams', 'games'].map(d1.count)).toEqual([0, 0, 0, 0])
    const d2 = await world()
    expect((await d2.del('/seasons/26')).status).toBe(200)
    expect(['seasons', 'phases', 'divisions', 'teams'].map(d2.count)).toEqual([0, 0, 0, 0])
  })
})
