// @vitest-environment node
//
// `node:sqlite`: a merge repoints a club's rows across eleven tables, and
// three of them reference `clubs` in ON DELETE CASCADE — so the claims are
// about what the tables hold once the removed row is gone, read back.
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #730 — the AGR calendar import created « Landser ASL » beside the onboarded
// « ASL Landser », and « Kembs ASL TT » beside the FFTT's « Kembs TT ».

const LANDSER = 'club-agr-680036'
const LANDSER_IMPORTED = 'club-1791925643418-2-o1zd8'
const KEMBS = 'club-fftt-06680140'
const KEMBS_IMPORTED = 'club-1791925679142-16-dfavb'

function world() {
  const d1 = migratedD1()
  d1.exec(`INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
    ('${LANDSER}', '', 'ASL Landser', 0),
    ('${LANDSER_IMPORTED}', '', 'Landser ASL', 0),
    ('${KEMBS}', '06680140', 'Kembs TT', 0),
    ('${KEMBS_IMPORTED}', '', 'Kembs ASL TT', 0)`)
  d1.exec(`INSERT INTO club_federations (club_id, federation_id, affiliation_number, name, organization_id) VALUES
    ('${LANDSER}', 'agr', '680036', NULL, NULL),
    ('${LANDSER_IMPORTED}', 'agr', '680036', 'LANDSER ASL', 'agr-68'),
    ('${KEMBS_IMPORTED}', 'agr', '', 'KEMBS ASL TT', 'agr-68')`)
  d1.exec(`INSERT INTO teams (id, club_id, phase_id, number, group_id) VALUES
    ('team-l1', '${LANDSER_IMPORTED}', 'phase-agr-27-1', 1, 'g-a'),
    ('team-l2', '${LANDSER_IMPORTED}', 'phase-agr-27-1', 2, 'g-b'),
    ('team-k1', '${KEMBS}', '27-1', 1, 'g-f'),
    ('team-k1-agr', '${KEMBS_IMPORTED}', 'phase-agr-27-1', 1, 'g-a')`)
  d1.exec(`INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) VALUES
    ('addr-k', '${KEMBS}', 'Salle', '1 rue', '68680', 'Kembs', 1),
    ('addr-k-agr', '${KEMBS_IMPORTED}', 'Gymnase', '2 rue', '68680', 'Kembs', 1)`)
  addMember(d1.exec, { id: 'gilles', firstName: 'Gilles', email: 'g@example.fr', clubId: LANDSER, role: 'club_admin' })
  addMember(d1.exec, { id: 'enzo', firstName: 'Enzo', clubId: LANDSER })
  addMember(d1.exec, { id: 'ga', firstName: 'Jade', email: 'jade@example.fr', clubId: null, role: 'general_admin' })
  return d1
}

async function as(d1: ReturnType<typeof world>, userId: string) {
  const token = `token-${userId}`
  d1.exec('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
    await sessionKey(token), userId, Date.now() + 3_600_000)
  return (clubId: string, targetId: unknown) =>
    app.fetch(
      new Request(`http://localhost/api/clubs/${clubId}/merge-into`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      }),
      { DB: d1.db },
    )
}

describe('merging two rows of one club (#730)', () => {
  it('brings Landser’s teams to its members, with the AGR name and organisation', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga(LANDSER_IMPORTED, LANDSER)).status).toBe(200)
    expect(d1.rows(`SELECT id FROM clubs WHERE id = '${LANDSER_IMPORTED}'`)).toEqual([])
    expect(d1.rows(`SELECT id FROM teams WHERE club_id = '${LANDSER}' ORDER BY id`))
      .toEqual([{ id: 'team-l1' }, { id: 'team-l2' }])
    expect(d1.rows(`SELECT id, role FROM users WHERE club_id = '${LANDSER}' ORDER BY id`))
      .toEqual([{ id: 'enzo', role: 'player' }, { id: 'gilles', role: 'club_admin' }])
    // The name the next calendar is matched against, and the committee.
    expect(d1.rows(`SELECT club_id, affiliation_number, name, organization_id FROM club_federations
      WHERE club_id IN ('${LANDSER}', '${LANDSER_IMPORTED}')`))
      .toEqual([{ club_id: LANDSER, affiliation_number: '680036', name: 'LANDSER ASL', organization_id: 'agr-68' }])
  })

  it('moves the AGR affiliation and teams onto the FFTT club, one default address', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    expect((await ga(KEMBS_IMPORTED, KEMBS)).status).toBe(200)
    expect(d1.rows(`SELECT club_id, federation_id, name FROM club_federations WHERE club_id = '${KEMBS}'`))
      .toEqual([{ club_id: KEMBS, federation_id: 'agr', name: 'KEMBS ASL TT' }])
    expect(d1.rows(`SELECT id FROM teams WHERE club_id = '${KEMBS}' ORDER BY id`))
      .toEqual([{ id: 'team-k1' }, { id: 'team-k1-agr' }])
    expect(d1.rows(`SELECT id, is_default FROM club_addresses WHERE club_id = '${KEMBS}' ORDER BY id`))
      .toEqual([{ id: 'addr-k', is_default: 1 }, { id: 'addr-k-agr', is_default: 0 }])
  })

  it('keeps the FFTT row whichever way it is asked — and refuses rather than flip it', async () => {
    const d1 = world()
    const ga = await as(d1, 'ga')
    const res = await ga(KEMBS, KEMBS_IMPORTED)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'keep_other' })
    expect(d1.rows(`SELECT id FROM clubs WHERE id = '${KEMBS}'`)).toEqual([{ id: KEMBS }])
  })

  it('refuses two teams of one number in one phase, and writes nothing', async () => {
    const d1 = world()
    d1.exec(`INSERT INTO teams (id, club_id, phase_id, number, group_id) VALUES
      ('team-l1-bis', '${LANDSER}', 'phase-agr-27-1', 1, 'g-c')`)
    const ga = await as(d1, 'ga')
    const res = await ga(LANDSER_IMPORTED, LANDSER)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'team_numbers' })
    expect(d1.rows(`SELECT club_id FROM teams WHERE id = 'team-l1'`)).toEqual([{ club_id: LANDSER_IMPORTED }])
  })

  it('refuses two different FFTT numbers: those are two clubs', async () => {
    const d1 = world()
    d1.exec("INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES ('club-fftt-06680011', '06680011', 'Rixheim PPA', 0)")
    const ga = await as(d1, 'ga')
    expect((await (await ga(KEMBS, 'club-fftt-06680011')).json())).toMatchObject({ error: 'fftt_numbers' })
  })

  it('is the general admin’s alone — not even the club’s own admin', async () => {
    const d1 = world()
    const gilles = await as(d1, 'gilles')
    expect((await gilles(LANDSER_IMPORTED, LANDSER)).status).toBe(403)
    expect(d1.rows(`SELECT id FROM clubs WHERE id = '${LANDSER_IMPORTED}'`)).toEqual([{ id: LANDSER_IMPORTED }])
  })
})
