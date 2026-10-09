import { describe, it, expect } from 'vitest'
import { federationOfTeam, licenceLabel, licenceOf, licencesOf } from './licences'

// #644 — a licence per federation. Gilles holds an FFTT licence at Rixheim and
// an AGR one at Landser; a Landser licensee may hold no FFTT licence at all.

describe('licencesOf / licenceOf', () => {
  it('puts the FFTT licence first, then the others', () => {
    const both = { licenseNumber: '6810333', licences: [{ federationId: 'agr', number: '1251178' }] }
    expect(licencesOf(both)).toEqual([
      { federationId: 'fftt', number: '6810333' },
      { federationId: 'agr', number: '1251178' },
    ])
    expect(licenceOf(both, 'agr')).toBe('1251178')
    expect(licenceOf(both, 'fftt')).toBe('6810333')
  })

  it('holds no FFTT licence for a member of the AGR alone', () => {
    const landser = { licenseNumber: '', licences: [{ federationId: 'agr', number: '1251178' }] }
    expect(licencesOf(landser).map((l) => l.federationId)).toEqual(['agr'])
    expect(licenceOf(landser, 'fftt')).toBe('')
  })

  it('reads a member predating federations as their FFTT licence alone', () => {
    expect(licencesOf({ licenseNumber: ' 6810333 ' })).toEqual([{ federationId: 'fftt', number: '6810333' }])
    expect(licenceOf({ licenseNumber: '6810333' }, 'agr')).toBe('')
  })

  it('never takes an FFTT entry from the list over the FFTT licence', () => {
    expect(licencesOf({ licenseNumber: '1', licences: [{ federationId: 'fftt', number: '2' }] }))
      .toEqual([{ federationId: 'fftt', number: '1' }])
  })
})

describe('federationOfTeam', () => {
  const divisions = [{ id: 'd-agr', competitionId: 'c-agr' }, { id: 'd-fftt', competitionId: 'c-fftt' }]
  const competitions = [{ id: 'c-agr', federationId: 'agr' }, { id: 'c-fftt', federationId: 'fftt' }]

  it("reads the team's division and competition", () => {
    expect(federationOfTeam({ divisionId: 'd-agr' }, divisions, competitions)).toBe('agr')
    expect(federationOfTeam({ divisionId: 'd-fftt' }, divisions, competitions)).toBe('fftt')
  })

  it('is the FFTT for no team, or a division in no competition', () => {
    expect(federationOfTeam(undefined, divisions, competitions)).toBe('fftt')
    expect(federationOfTeam({ divisionId: 'gone' }, divisions, competitions)).toBe('fftt')
  })
})


describe('licenceLabel', () => {
  const FFTT = { id: 'fftt', shortName: 'FFTT' }
  const AGR = { id: 'agr', shortName: 'AGR' }

  it('says « Licence » while the FFTT is the only federation, and names it after', () => {
    expect(licenceLabel('fftt', [FFTT])).toBe('Licence')
    expect(licenceLabel('fftt', [])).toBe('Licence')
    expect(licenceLabel('agr', [FFTT, AGR])).toBe('Licence AGR')
  })
})
