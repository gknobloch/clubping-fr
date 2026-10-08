import { describe, it, expect } from 'vitest'
import type { Club } from '@/types'
import {
  affiliationsLine, clubAffiliations, clubIdForAffiliation, clubIsIn, clubNameIn, federationOfCompetition,
  federationOfDivision, federationOptionLabel,
} from './federations'

// #643 — a second federation. What matters here is the default: everything
// that existed before it is the FFTT's, without a single row being rewritten.

const club = (over: Partial<Club> = {}): Club => ({
  id: 'club-fftt-04680021', affiliationNumber: '04680021', displayName: 'Kembs ASL',
  isArchived: false, addresses: [], channels: [], ...over,
})

describe('federationOfCompetition / federationOfDivision', () => {
  const competitions = [
    { id: 'c-fftt', federationId: 'fftt' },
    { id: 'c-agr', federationId: 'agr' },
    { id: 'c-old' },
  ]

  it('reads the competition', () => {
    expect(federationOfCompetition(competitions[1])).toBe('agr')
    expect(federationOfDivision({ competitionId: 'c-agr' }, competitions)).toBe('agr')
  })

  it('is the FFTT for a division in no competition, or one predating federations', () => {
    expect(federationOfDivision({}, competitions)).toBe('fftt')
    expect(federationOfDivision({ competitionId: 'c-old' }, competitions)).toBe('fftt')
    expect(federationOfDivision({ competitionId: 'gone' }, competitions)).toBe('fftt')
  })
})

describe('clubAffiliations', () => {
  it('puts the FFTT number first, then the other federations', () => {
    const kembs = club({ affiliations: [{ federationId: 'agr', affiliationNumber: '680021', name: 'KEMBS ASL TT' }] })
    expect(clubAffiliations(kembs).map((a) => a.federationId)).toEqual(['fftt', 'agr'])
    expect(clubIsIn(kembs, 'agr')).toBe(true)
  })

  it('leaves the FFTT out for a club without an FFTT number', () => {
    const landser = club({
      id: 'club-agr-680036', affiliationNumber: '', displayName: 'Landser ASL',
      affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }],
    })
    expect(clubAffiliations(landser).map((a) => a.federationId)).toEqual(['agr'])
    expect(clubIsIn(landser, 'fftt')).toBe(false)
  })

  it('reads a club predating federations as the FFTT only', () => {
    expect(clubAffiliations(club())).toEqual([{ federationId: 'fftt', affiliationNumber: '04680021' }])
  })

  it('never takes an FFTT row from the list over the FFTT number', () => {
    const odd = club({ affiliations: [{ federationId: 'fftt', affiliationNumber: '999' }] })
    expect(clubAffiliations(odd)).toEqual([{ federationId: 'fftt', affiliationNumber: '04680021' }])
  })
})

describe('clubNameIn', () => {
  it("is the federation's own name for the club, or the club's name", () => {
    const kembs = club({ affiliations: [{ federationId: 'agr', affiliationNumber: '', name: 'KEMBS ASL TT' }] })
    expect(clubNameIn(kembs, 'agr')).toBe('KEMBS ASL TT')
    expect(clubNameIn(kembs, 'fftt')).toBe('Kembs ASL')
  })
})

describe('clubIdForAffiliation', () => {
  it('keeps the FFTT id space', () => {
    expect(clubIdForAffiliation('fftt', '04680021')).toBe('club-fftt-04680021')
    expect(clubIdForAffiliation('fftt', '680036')).toBeNull()
  })

  it('gives a club outside the FFTT an id of its own federation', () => {
    expect(clubIdForAffiliation('agr', ' 680036 ')).toBe('club-agr-680036')
    expect(clubIdForAffiliation('agr', '')).toBeNull()
    expect(clubIdForAffiliation('agr', '68-0036')).toBeNull()
  })
})

describe('affiliationsLine', () => {
  const short = (id: string) => id.toUpperCase()

  it('prints what it always printed for a club of the FFTT alone', () => {
    expect(affiliationsLine(club(), short)).toBe('N° 04680021')
  })

  it('names every federation once there is another', () => {
    const kembs = club({ affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }] })
    expect(affiliationsLine(kembs, short)).toBe('FFTT n° 04680021 · AGR n° 680021')
    const landser = club({ affiliationNumber: '', affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] })
    expect(affiliationsLine(landser, short)).toBe('AGR n° 680036')
  })

  it('says nothing of a federation without a number', () => {
    expect(affiliationsLine(club({ affiliationNumber: '', affiliations: [{ federationId: 'agr', affiliationNumber: '' }] }), short)).toBe('')
  })
})

describe('federationOptionLabel', () => {
  it('names the federation once', () => {
    expect(federationOptionLabel({ shortName: 'FFTT', displayName: 'Fédération française de tennis de table' }))
      .toBe('FFTT — Fédération française de tennis de table')
    expect(federationOptionLabel({ shortName: 'AGR', displayName: 'AGR Tennis de table — Section du Haut-Rhin' }))
      .toBe('AGR Tennis de table — Section du Haut-Rhin')
  })
})
