import { describe, expect, it } from 'vitest'
import type { Player, User } from '@/types'
import { buildImportRows, defaultImportSelection, importCandidates, personCandidates, playerImportWrites, writableFields, type ImportFederation } from './ffttPlayers'
import { parseAgrPlayerListLines, type AgrPlayerList } from './agrPlayerList'
import { AGR_PLAYER_LIST } from './__fixtures__/agrPlayerList'

// #648 — the FFTT's import review, serving an AGR player list: the AGR
// licence is matched and written, the classement filed, and a person who
// exists keeps their name.

const AGR: ImportFederation = { id: 'agr', shortName: 'AGR' }
const list = (parseAgrPlayerListLines(AGR_PLAYER_LIST) as AgrPlayerList).licences
const player = (over: Partial<Player> & Pick<Player, 'id'>): Player => ({
  firstName: 'X', lastName: 'Y', licenseNumber: '', phone: '', status: 'active', clubId: 'landser', ...over,
})
// Lucas is known under his AGR licence, and spelled our way.
const lucas = player({ id: 'lucas', firstName: 'Lucas', lastName: 'Martín', licences: [{ federationId: 'agr', number: '1251100' }] })
// Joris plays at Rixheim (FFTT 681001) — a distinct profile, never matched by an FFTT number.
const joris = player({ id: 'joris', firstName: 'Joris', lastName: 'Simon', licenseNumber: '353200', clubId: 'landser' })
const players = [lucas, joris]
const users = players.map((p) => ({ ...p, role: 'player', isPlayer: true }) as User)

const rows = () => buildImportRows(list, players, [], 'phase-agr-27-1', importCandidates(users, 'landser', AGR), [], undefined, new Map(), AGR)

describe('the import review, for an AGR list (#648)', () => {
  it('matches a member on their AGR licence — never on the FFTT number', () => {
    const r = rows()
    expect(r.find((x) => x.licence.licence === '1251100')?.playerId).toBe('lucas')
    // Joris's FFTT number happens to equal this AGR licence: not a match.
    expect(r.find((x) => x.licence.licence === '353200')?.playerId).toBeUndefined()
  })

  it('never renames a person who exists, and calls the value a classement', () => {
    const fields = rows().find((x) => x.playerId === 'lucas')!.fields
    expect(fields.find((f) => f.key === 'lastName')).toMatchObject({ current: 'Martín', incoming: 'Martin', unchanged: true })
    expect(fields.find((f) => f.key === 'points')).toMatchObject({ label: 'Classement', incoming: '80' })
    expect(fields.find((f) => f.key === 'licenseNumber')?.label).toBe('N° licence AGR')
  })

  it('writes the AGR licence to the member’s licences, and the classement to the AGR phase', () => {
    const r = rows()
    const writes = playerImportWrites(r, defaultImportSelection(r), {
      clubId: 'landser', phaseId: 'phase-agr-27-1', newId: (() => { let n = 0; return () => `new-${n++}` })(), federationId: 'agr',
    })
    expect(writes.creates[0]).toMatchObject({
      lastName: 'Bernard', licenseNumber: '', licences: [{ federationId: 'agr', number: '351100' }], clubId: 'landser',
    })
    expect(writes.points).toContainEqual({ phaseId: 'phase-agr-27-1', playerId: 'lucas', points: '80' })
    expect(writes.updates.find((u) => u.id === 'lucas')).toBeUndefined()
  })

  it('suggests a namesake, and confirming it gives them the AGR licence', () => {
    const r = rows()
    const simon = r.find((x) => x.licence.licence === '353200')!
    expect(simon.link).toMatchObject({ id: 'joris', on: 'name' })
    const confirmed = buildImportRows(list, players, [], 'phase-agr-27-1', importCandidates(users, 'landser', AGR), [], undefined, new Map([['353200', 'joris']]), AGR)
    const writes = playerImportWrites(confirmed, defaultImportSelection(confirmed), {
      clubId: 'landser', phaseId: 'phase-agr-27-1', newId: () => 'n', federationId: 'agr',
    })
    expect(writes.updates.find((u) => u.id === 'joris')?.patch).toEqual({ licences: [{ federationId: 'agr', number: '353200' }] })
  })
})

// #731 — someone the AGR list names already plays the FFTT in another club.
describe('a person of another club, for an AGR list (#731)', () => {
  const bernard = list.find((l) => l.licence === '351100')!
  const rixheim = { ...player({ id: 'p-rix', clubId: 'rixheim' }), firstName: bernard.firstName, lastName: bernard.lastName, email: 'b@example.fr', personId: 'person-b' }
  const everyone = [...users, { ...rixheim, role: 'player', isPlayer: true } as User]
  const clubs = [{ id: 'rixheim', displayName: 'Rixheim PPA' }, { id: 'landser', displayName: 'ASL Landser' }]
  const persons = personCandidates(everyone, clubs, 'landser', AGR)
  const build = (links: Map<string, string>) =>
    buildImportRows(list, players, [], 'phase-agr-27-1', importCandidates(users, 'landser', AGR), [], undefined, links, AGR, persons)

  it('asks whether the licensee is the person who plays at Rixheim', () => {
    expect(build(new Map()).find((x) => x.licence.licence === '351100')?.link)
      .toMatchObject({ id: 'person-b', on: 'person', clubNames: ['Rixheim PPA'] })
  })

  it('confirmed, adds a profile on that person — licence and classement under the minted id', () => {
    const r = build(new Map([['351100', 'person-b']]))
    const row = r.find((x) => x.licence.licence === '351100')!
    expect(row.join).toMatchObject({ personId: 'person-b', sourceId: 'p-rix' })
    // The person keeps their name: only the licence and the classement are written.
    expect(writableFields(row.fields).map((f) => f.key)).toEqual(['licenseNumber', 'points'])
    const writes = playerImportWrites(r, defaultImportSelection(r), {
      clubId: 'landser', phaseId: 'phase-agr-27-1', newId: () => 'minted', federationId: 'agr',
    })
    expect(writes.profiles).toEqual([
      { id: 'minted', sourceId: 'p-rix', clubId: 'landser', licences: [{ federationId: 'agr', number: '351100' }] },
    ])
    expect(writes.creates.find((c) => c.licences?.[0].number === '351100')).toBeUndefined()
    expect(writes.points).toContainEqual(expect.objectContaining({ playerId: 'minted' }))
  })

  it('is never offered for an FFTT list, nor for someone already in the club', () => {
    expect(personCandidates(everyone, clubs, 'landser')).toEqual([])
    expect(personCandidates(everyone, clubs, 'rixheim', AGR).find((p) => p.personId === 'person-b')).toBeUndefined()
  })
})
