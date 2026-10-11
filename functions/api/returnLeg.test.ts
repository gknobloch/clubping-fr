// @vitest-environment node
//
// `node:sqlite`, every migration: the return leg is built from the phase-1
// rows and must be found again by the phase-2 import.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'
import { parseAgrScheduleLines, type AgrScheduleDocument } from '../../src/lib/agrScheduleDocument'
import { PROM_HONNEUR_A_PHASE_1, PROM_HONNEUR_A_PHASE_2 } from '../../src/lib/__fixtures__/agrSchedules'

// #649 — an AGR poule plays phase 2 as phase 1 reversed. Once both phases
// exist, the return leg is there to plan; the phase-2 PDF only dates it.

const LANDSER = 'club-agr-680036'
const KEMBS = 'club-fftt-06680140'
const RIXHEIM = 'club-fftt-06680011'

function world({ phase2 = true } = {}) {
  const d1 = migratedD1()
  d1.exec(`INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
    ('${LANDSER}', '', 'Landser ASL', 0), ('${KEMBS}', '06680140', 'Kembs TT', 0), ('${RIXHEIM}', '06680011', 'Rixheim PPA', 0)`)
  d1.exec(`INSERT INTO club_federations (club_id, federation_id, affiliation_number, name) VALUES
    ('${LANDSER}', 'agr', '680036', 'LANDSER ASL'), ('${KEMBS}', 'agr', '680021', 'KEMBS ASL TT')`)
  d1.exec("INSERT INTO seasons (id, display_name, status, federation_id) VALUES ('agr-27', '2026/2027', 'active', 'agr')")
  d1.exec("INSERT INTO phases (id, season_id, name, display_name, status) VALUES ('phase-agr-27-1', 'agr-27', 'Phase 1', '2026/2027 Phase 1', 'active')")
  if (phase2) {
    d1.exec("INSERT INTO phases (id, season_id, name, display_name, status) VALUES ('phase-agr-27-2', 'agr-27', 'Phase 2', '2026/2027 Phase 2', 'upcoming')")
  }
  d1.exec("INSERT INTO competitions (id, display_name, federation_id) VALUES ('comp-agr', 'Championnat Messieurs', 'agr')")
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  addMember(d1.exec, { id: 'landser-admin', firstName: 'Lou', email: 'lou@example.fr', clubId: LANDSER, role: 'club_admin' })
  addMember(d1.exec, { id: 'rixheim-admin', firstName: 'Rémi', email: 'remi@example.fr', clubId: RIXHEIM, role: 'club_admin' })
  const count = (sql: string) => d1.rows<{ n: number }>(`SELECT count(*) AS n FROM ${sql}`)[0].n
  return { ...d1, count }
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (path: string, body: unknown = {}) =>
    app.fetch(new Request(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }), { DB: d1.db })
}

const doc = (lines: string[]) => parseAgrScheduleLines(lines) as AgrScheduleDocument
const payload = (lines: string[], phaseId: string, extra: Record<string, unknown> = {}) => {
  const d = doc(lines)
  return {
    federationId: 'agr', phaseId, competitionId: 'comp-agr',
    division: d.division, poolNumber: d.poolNumber, playersPerGame: 4, notes: d.notes,
    clubs: d.clubs.map((name) => ({ name, clubId: name === 'LANDSER ASL' ? LANDSER : name === 'KEMBS ASL TT' ? KEMBS : null })),
    journees: d.journees,
    ...extra,
  }
}
/** Phase 2, matched by its own two club names — the resolution the review would make after phase 1. */
const phase2Payload = (d1: ReturnType<typeof world>) => {
  const byName = Object.fromEntries(d1.rows<{ club_id: string; name: string }>(
    "SELECT club_id, name FROM club_federations WHERE federation_id = 'agr'").map((r) => [r.name, r.club_id]))
  const d = doc(PROM_HONNEUR_A_PHASE_2)
  return { ...payload(PROM_HONNEUR_A_PHASE_2, 'phase-agr-27-2'), clubs: d.clubs.map((name) => ({ name, clubId: byName[name] ?? null })) }
}
const phase2Days = (d1: ReturnType<typeof world>) => d1.rows<{ number: number; date: string }>(
  `SELECT m.number, m.date FROM match_days m JOIN groups g ON g.id = m.group_id JOIN divisions d ON d.id = g.division_id
    WHERE d.phase_id = 'phase-agr-27-2' ORDER BY m.number`)
const landserKembsJ8 = (d1: ReturnType<typeof world>) => d1.rows<{ home: string; date: string | null; source: string }>(
  `SELECT h.club_id AS home, g.date, g.source FROM games g JOIN match_days m ON m.id = g.match_day_id
     JOIN teams h ON h.id = g.home_team_id JOIN teams a ON a.id = g.away_team_id
    WHERE m.number = 8 AND h.club_id IN ('${LANDSER}', '${KEMBS}') AND a.club_id IN ('${LANDSER}', '${KEMBS}')`)

describe('the return leg (#649)', () => {
  it('is built as phase 1 is imported, when phase 2 exists: reversed, numbered on, dated provisionally', async () => {
    const d1 = world()
    const landser = await as(d1, 'landser-admin')
    const res = await landser('/federation-schedules/import', payload(PROM_HONNEUR_A_PHASE_1, 'phase-agr-27-1', { secondPhase: 'return_leg' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ returnLeg: { division: true, group: true, teams: 8, matchDays: 7, games: 28 } })
    expect(d1.rows("SELECT second_phase FROM divisions WHERE phase_id = 'phase-agr-27-1'")).toEqual([{ second_phase: 'return_leg' }])
    // Journées 8 to 14; the first lands where the AGR's real calendar puts it.
    const days = phase2Days(d1)
    expect(days.map((d) => d.number)).toEqual([8, 9, 10, 11, 12, 13, 14])
    expect(days[0].date).toBe('2027-01-29')
    // J1 was Kembs at home; J8 is Landser — undated, a mirror.
    expect(landserKembsJ8(d1)).toEqual([{ home: LANDSER, date: null, source: 'mirror' }])
    // The team carries its slot and its note into phase 2.
    expect(d1.rows(`SELECT default_day FROM teams WHERE club_id = '${LANDSER}' AND phase_id = 'phase-agr-27-2'`))
      .toEqual([{ default_day: 'Vendredi' }])
    expect(d1.rows<{ note: string }>(`SELECT g.note FROM groups g JOIN divisions d ON d.id = g.division_id WHERE d.phase_id = 'phase-agr-27-2'`)[0].note)
      .toMatch(/^KIRCHBERG\/NIEDERBRUCK 4 JOUE A NIEDERBRUCK/)
  })

  it('is dated by the phase-2 PDF, which creates nothing beside it', async () => {
    const d1 = world()
    const landser = await as(d1, 'landser-admin')
    await landser('/federation-schedules/import', payload(PROM_HONNEUR_A_PHASE_1, 'phase-agr-27-1', { secondPhase: 'return_leg' }))
    const res = await landser('/federation-schedules/import', phase2Payload(d1))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      created: { division: false, group: false, clubs: 0, teams: 0, matchDays: 0, games: 0 }, updatedGames: 28,
    })
    expect(d1.count("games WHERE source = 'mirror'")).toBe(0)
    expect(landserKembsJ8(d1)).toEqual([{ home: LANDSER, date: '2027-01-29', source: 'document' }])
  })

  it('takes who receives from the PDF when it differs from the mirror', async () => {
    const d1 = world()
    const landser = await as(d1, 'landser-admin')
    await landser('/federation-schedules/import', payload(PROM_HONNEUR_A_PHASE_1, 'phase-agr-27-1', { secondPhase: 'return_leg' }))
    const body = phase2Payload(d1)
    const j8 = body.journees[0].matches[0]
    body.journees[0].matches[0] = { ...j8, home: j8.away, away: j8.home }
    await landser('/federation-schedules/import', body)
    expect(landserKembsJ8(d1)).toEqual([{ home: KEMBS, date: '2027-01-29', source: 'document' }])
  })

  it('waits for phase 2 to be created, then is built with it', async () => {
    const d1 = world({ phase2: false })
    const landser = await as(d1, 'landser-admin')
    const res = await landser('/federation-schedules/import', payload(PROM_HONNEUR_A_PHASE_1, 'phase-agr-27-1', { secondPhase: 'return_leg' }))
    expect(await res.json()).not.toHaveProperty('returnLeg')
    const ga = await as(d1, 'ga')
    expect((await ga('/phases', { id: 'phase-agr-27-2', seasonId: 'agr-27', name: 'Phase 2', displayName: '2026/2027 Phase 2' })).status).toBe(200)
    expect(phase2Days(d1)).toHaveLength(7)
    expect(d1.count("games WHERE source = 'mirror'")).toBe(28)
  })

  it('is prepared on demand by a club of the poule, once, and only for a return-leg division', async () => {
    const d1 = world()
    const landser = await as(d1, 'landser-admin')
    await landser('/federation-schedules/import', payload(PROM_HONNEUR_A_PHASE_1, 'phase-agr-27-1'))
    const [{ id: groupId }] = d1.rows<{ id: string }>('SELECT id FROM groups')
    expect((await landser(`/groups/${groupId}/return-leg`)).status).toBe(409)
    d1.exec("UPDATE divisions SET second_phase = 'return_leg'")
    expect((await (await as(d1, 'rixheim-admin'))(`/groups/${groupId}/return-leg`)).status).toBe(403)
    const first = await landser(`/groups/${groupId}/return-leg`)
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ created: { matchDays: 7, games: 28 } })
    const again = await landser(`/groups/${groupId}/return-leg`)
    expect(await again.json()).toMatchObject({ created: { division: false, group: false, teams: 0, matchDays: 0, games: 0 } })
    expect(d1.count('games')).toBe(56)
  })
})
