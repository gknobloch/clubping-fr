// @vitest-environment node
//
// `node:sqlite`, every migration: the import builds a poule from nothing and
// must find it again on the second run — the claims are about the rows.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'
import { parseAgrScheduleLines, type AgrScheduleDocument } from '../../src/lib/agrScheduleDocument'
import { PROM_HONNEUR_A_PHASE_1, PROM_HONNEUR_A_PHASE_2 } from '../../src/lib/__fixtures__/agrSchedules'

// #647 — an AGR calendar, read in the browser, written here. Landser and Kembs
// play in the same Promotion Honneur poule: whichever imports second finds it.

const LANDSER = 'club-agr-680036'
const KEMBS = 'club-fftt-06680140'
const RIXHEIM = 'club-fftt-06680011'

function world() {
  const d1 = migratedD1()
  d1.exec(`INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
    ('${LANDSER}', '', 'Landser ASL', 0), ('${KEMBS}', '06680140', 'Kembs TT', 0), ('${RIXHEIM}', '06680011', 'Rixheim PPA', 0)`)
  d1.exec(`INSERT INTO club_federations (club_id, federation_id, affiliation_number, name) VALUES
    ('${LANDSER}', 'agr', '680036', NULL), ('${KEMBS}', 'agr', '680021', 'KEMBS ASL TT')`)
  d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('27', '2026/2027', 'active')")
  d1.exec(`INSERT INTO phases (id, season_id, name, display_name, status, federation_id) VALUES
    ('phase-agr-27-1', '27', 'Phase 1', '2026/2027 Phase 1', 'active', 'agr'),
    ('phase-agr-27-2', '27', 'Phase 2', '2026/2027 Phase 2', 'upcoming', 'agr')`)
  d1.exec("INSERT INTO competitions (id, display_name, federation_id) VALUES ('comp-agr', 'Championnat Messieurs', 'agr')")
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  addMember(d1.exec, { id: 'landser-admin', firstName: 'Lou', email: 'lou@example.fr', clubId: LANDSER, role: 'club_admin' })
  addMember(d1.exec, { id: 'kembs-admin', firstName: 'Kim', email: 'kim@example.fr', clubId: KEMBS, role: 'club_admin' })
  addMember(d1.exec, { id: 'rixheim-admin', firstName: 'Rémi', email: 'remi@example.fr', clubId: RIXHEIM, role: 'club_admin' })
  const count = (sql: string) => d1.rows<{ n: number }>(`SELECT count(*) AS n FROM ${sql}`)[0].n
  return { ...d1, count }
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (body: unknown) =>
    app.fetch(new Request('http://localhost/api/federation-schedules/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }), { DB: d1.db })
}

const doc = (lines: string[]) => parseAgrScheduleLines(lines) as AgrScheduleDocument

/** What the review sends: the document, its phase, and each club as the admin resolved it. */
const payload = (d: AgrScheduleDocument, phaseId: string, resolved: Record<string, string>) => ({
  federationId: 'agr', phaseId, competitionId: 'comp-agr',
  division: d.division, poolNumber: d.poolNumber, playersPerGame: 4, notes: d.notes,
  clubs: d.clubs.map((name) => ({ name, clubId: resolved[name] ?? null })),
  journees: d.journees,
})

describe('importing an AGR calendar (#647)', () => {
  it('lets Landser’s admin build the poule: division, poule, bare opponents, teams, journées, matches', async () => {
    const d1 = world()
    const landser = await as(d1, 'landser-admin')
    const res = await landser(payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', { 'LANDSER ASL': LANDSER, 'KEMBS ASL TT': KEMBS }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      created: { division: true, group: true, clubs: 5, teams: 8, matchDays: 7, games: 28 }, updatedGames: 0,
    })
    expect(d1.rows("SELECT display_name, competition_id, players_per_game FROM divisions"))
      .toEqual([{ display_name: 'Prom. HONNEUR', competition_id: 'comp-agr', players_per_game: 4 }])
    const [group] = d1.rows<{ number: number; note: string }>('SELECT number, note FROM groups')
    expect(group.number).toBe(1)
    expect(group.note.split('\n')[0]).toBe('KIRCHBERG/NIEDERBRUCK 4 JOUE A NIEDERBRUCK')
    // Each match its own date and time; a team seeded with its usual home slot.
    expect(d1.rows("SELECT date, time FROM games WHERE time = '20h15'")).toEqual([{ date: '2026-09-24', time: '20h15' }])
    expect(d1.rows(`SELECT default_day, default_time FROM teams WHERE club_id = '${LANDSER}'`))
      .toEqual([{ default_day: 'Vendredi', default_time: '20h00' }])
    // The bare opponents are known by their AGR name next time; Landser gains its own.
    expect(d1.count("club_federations WHERE federation_id = 'agr' AND name IS NOT NULL")).toBe(7)
    expect(d1.rows(`SELECT name FROM club_federations WHERE club_id = '${LANDSER}'`)).toEqual([{ name: 'LANDSER ASL' }])
  })

  it('finds the same poule again when Kembs imports it, and creates nothing', async () => {
    const d1 = world()
    await (await as(d1, 'landser-admin'))(payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', { 'LANDSER ASL': LANDSER, 'KEMBS ASL TT': KEMBS }))
    const byName = Object.fromEntries(d1.rows<{ club_id: string; name: string }>(
      "SELECT club_id, name FROM club_federations WHERE federation_id = 'agr'").map((r) => [r.name, r.club_id]))
    const res = await (await as(d1, 'kembs-admin'))(payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', byName))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      created: { division: false, group: false, clubs: 0, teams: 0, matchDays: 0, games: 0 }, updatedGames: 0,
    })
    expect(d1.count('groups')).toBe(1)
    expect(d1.count('games')).toBe(28)
  })

  it('keeps phase 2’s journées 8 to 14, in the AGR’s phase 2', async () => {
    const d1 = world()
    const res = await (await as(d1, 'landser-admin'))(payload(doc(PROM_HONNEUR_A_PHASE_2), 'phase-agr-27-2', { 'LANDSER ASL': LANDSER, 'KEMBS ASL TT': KEMBS }))
    expect(res.status).toBe(200)
    expect(d1.rows<{ number: number }>('SELECT number FROM match_days ORDER BY number').map((r) => r.number))
      .toEqual([8, 9, 10, 11, 12, 13, 14])
  })

  it('refuses the admin of a club outside the federation, or one the calendar does not name', async () => {
    const d1 = world()
    const body = payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', { 'LANDSER ASL': LANDSER })
    expect((await (await as(d1, 'rixheim-admin'))(body)).status).toBe(403)
    // Kembs is in the AGR, but this payload left « KEMBS ASL TT » unresolved: not its poule.
    expect((await (await as(d1, 'kembs-admin'))(body)).status).toBe(403)
    expect(d1.count('groups')).toBe(0)
  })

  it('refuses a phase or competition of another federation, and a federation the app imports from', async () => {
    const d1 = world()
    // The FFTT's Phase 1 of the same, shared season (#645).
    d1.exec("INSERT INTO phases (id, season_id, name, display_name, status, federation_id) VALUES ('phase-27-1', '27', 'Phase 1', 'x', 'active', 'fftt')")
    const ga = await as(d1, 'ga')
    const body = payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', { 'LANDSER ASL': LANDSER })
    expect((await ga({ ...body, phaseId: 'phase-27-1' })).status).toBe(400)
    expect((await ga({ ...body, federationId: 'fftt' })).status).toBe(400)
    expect((await ga({ ...body, competitionId: 'nope' })).status).toBe(400)
    expect(d1.count('divisions')).toBe(0)
  })

  it('puts « Prom. HONNEUR » in our « Promotion Honneur », or in the division the review chose (#647)', async () => {
    const d1 = world()
    d1.exec(`INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, competition_id) VALUES
      ('d-ph', 'phase-agr-27-1', 'Promotion Honneur', 4, 4, 0, 'comp-agr'),
      ('d-other', 'phase-agr-27-1', 'Honneur', 3, 4, 0, 'comp-agr')`)
    const landser = await as(d1, 'landser-admin')
    const res = await landser(payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', { 'LANDSER ASL': LANDSER, 'KEMBS ASL TT': KEMBS }))
    expect(await res.json()).toMatchObject({ divisionId: 'd-ph', created: { division: false } })
    expect(d1.rows('SELECT division_id FROM groups')).toEqual([{ division_id: 'd-ph' }])
    expect(d1.rows('SELECT count(*) AS n FROM divisions')).toEqual([{ n: 2 }])
  })

  it('takes the division chosen in the review, and refuses one of another phase', async () => {
    const d1 = world()
    d1.exec(`INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, competition_id) VALUES
      ('d-chosen', 'phase-agr-27-1', 'PH secteur Sud', 4, 4, 0, 'comp-agr'),
      ('d-p2', 'phase-agr-27-2', 'Promotion Honneur', 4, 4, 0, 'comp-agr')`)
    const landser = await as(d1, 'landser-admin')
    const body = payload(doc(PROM_HONNEUR_A_PHASE_1), 'phase-agr-27-1', { 'LANDSER ASL': LANDSER, 'KEMBS ASL TT': KEMBS })
    expect((await landser({ ...body, divisionId: 'd-p2' })).status).toBe(400)
    expect(await (await landser({ ...body, divisionId: 'd-chosen' })).json()).toMatchObject({ divisionId: 'd-chosen' })
  })
})
