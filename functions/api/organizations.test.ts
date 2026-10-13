// @vitest-environment node
//
// `node:sqlite`, every migration (0073 included): organisations per
// federation, a division's and a club's (#692).
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'
import { parseAgrScheduleLines, type AgrScheduleDocument } from '../../src/lib/agrScheduleDocument'
import { PROM_HONNEUR_A_PHASE_1 } from '../../src/lib/__fixtures__/agrSchedules'

const LANDSER = 'club-agr-680036'

async function world() {
  const d1 = migratedD1()
  d1.exec("INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES (?, '', 'Landser ASL', 0)", LANDSER)
  d1.exec("INSERT INTO club_federations (club_id, federation_id, affiliation_number, name) VALUES (?, 'agr', '680036', 'LANDSER ASL')", LANDSER)
  d1.exec("INSERT INTO seasons (id, display_name, status) VALUES ('27', '2026/2027', 'active')")
  d1.exec(`INSERT INTO phases (id, season_id, name, display_name, status, federation_id) VALUES
    ('phase-27-1', '27', 'Phase 1', '2026/2027 Phase 1', 'active', 'fftt'),
    ('phase-agr-27-1', '27', 'Phase 1', '2026/2027 Phase 1', 'active', 'agr')`)
  d1.exec("INSERT INTO competitions (id, display_name, federation_id) VALUES ('comp-agr', 'Championnat du Haut-Rhin', 'agr')")
  d1.exec("INSERT INTO organizations (id, type, identifier, name, updated_at, federation_id) VALUES ('12', 'League', 'L06', 'Grand Est', 'x', 'fftt')")
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  addMember(d1.exec, { id: 'landser-admin', firstName: 'Lou', email: 'lou@example.fr', clubId: LANDSER, role: 'club_admin' })
  for (const id of ['ga', 'landser-admin']) {
    d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)', await sessionKey(`t-${id}`), id, Date.now() + 3_600_000)
  }
  const call = (who: string, path: string, method: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer t-${who}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB: d1.db })
  return { ...d1, call }
}

describe('organisations per federation (#692)', () => {
  it('seeds the AGR’s Haut-Rhin and Bas-Rhin, and keeps them out of the FFTT’s list', async () => {
    const d1 = await world()
    expect(d1.rows("SELECT id, name FROM organizations WHERE federation_id = 'agr' ORDER BY id"))
      .toEqual([{ id: 'agr-67', name: 'Bas-Rhin' }, { id: 'agr-68', name: 'Haut-Rhin' }])
    const fftt = await (await d1.call('ga', '/fftt/organizations', 'GET')).json() as { organizations: Array<{ id: string }> }
    expect(fftt.organizations.map((o) => o.id)).toEqual(['12'])
  })

  it('files an imported AGR poule’s division, and the clubs it learns, under the chosen organisation', async () => {
    const d1 = await world()
    const doc = parseAgrScheduleLines(PROM_HONNEUR_A_PHASE_1) as AgrScheduleDocument
    const res = await d1.call('landser-admin', '/federation-schedules/import', 'POST', {
      federationId: 'agr', phaseId: 'phase-agr-27-1', competitionId: 'comp-agr', organizationId: 'agr-68',
      division: doc.division, poolNumber: doc.poolNumber, playersPerGame: 4, notes: doc.notes,
      clubs: doc.clubs.map((name) => ({ name, clubId: name === 'LANDSER ASL' ? LANDSER : null })),
      journees: doc.journees,
    })
    expect(res.status).toBe(200)
    expect(d1.rows('SELECT organization_id FROM divisions')).toEqual([{ organization_id: 'agr-68' }])
    expect(d1.rows("SELECT DISTINCT organization_id FROM club_federations WHERE federation_id = 'agr'")).toEqual([{ organization_id: 'agr-68' }])
    // An organisation of another federation is refused.
    const refused = await d1.call('landser-admin', '/federation-schedules/import', 'POST', {
      federationId: 'agr', phaseId: 'phase-agr-27-1', competitionId: 'comp-agr', organizationId: '12',
      division: doc.division, poolNumber: doc.poolNumber, playersPerGame: 4, notes: [],
      clubs: doc.clubs.map((name) => ({ name, clubId: name === 'LANDSER ASL' ? LANDSER : null })), journees: doc.journees,
    })
    expect(refused.status).toBe(400)
  })

  it('takes a division’s organisation from its phase’s federation only, and carries it in /data', async () => {
    const d1 = await world()
    const division = (id: string, phaseId: string, organizationId: string, competitionId: string | null) =>
      ({ id, phaseId, displayName: id, rank: 1, playersPerGame: 4, isArchived: false, competitionId, organizationId })
    expect((await d1.call('ga', '/divisions', 'POST', division('exc', 'phase-agr-27-1', '12', 'comp-agr'))).status).toBe(400)
    expect((await d1.call('ga', '/divisions', 'POST', division('exc', 'phase-agr-27-1', 'agr-67', 'comp-agr'))).status).toBe(200)
    const data = await (await d1.call('ga', '/data', 'GET')).json() as {
      divisions: Array<{ id: string; organizationId?: string }>; organizations: Array<{ id: string; federationId: string }>
    }
    expect(data.divisions.find((d) => d.id === 'exc')?.organizationId).toBe('agr-67')
    // The AGR's two; the FFTT's only once a division names one.
    expect(data.organizations.map((o) => o.id).sort()).toEqual(['agr-67', 'agr-68'])
  })

  it('lets a club name its organisation in a federation, one of that federation’s', async () => {
    const d1 = await world()
    const put = (organizationId: string) => d1.call('landser-admin', `/clubs/${LANDSER}/affiliations/agr`, 'PUT',
      { affiliationNumber: '680036', name: 'LANDSER ASL', organizationId })
    expect((await put('12')).status).toBe(400)
    expect((await put('agr-67')).status).toBe(200)
    expect(d1.rows('SELECT organization_id FROM club_federations')).toEqual([{ organization_id: 'agr-67' }])
  })
})
