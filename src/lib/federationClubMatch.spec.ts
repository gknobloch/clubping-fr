import { describe, expect, it } from 'vitest'
import type { Club } from '@/types'
import { matchFederationClub } from './federationClubMatch'

// #647 — the AGR names a club its own way; the import finds it, or proposes to create it.

const club = (id: string, displayName: string, over: Partial<Club> = {}): Club =>
  ({ id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over })
const clubs = [
  club('kembs', 'Kembs TT', { affiliations: [{ federationId: 'agr', affiliationNumber: '680021', name: 'KEMBS ASL TT' }] }),
  club('landser', 'Landser ASL', { affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] }),
  club('old', 'Moosch St Augustin', { isArchived: true }),
]

describe('matchFederationClub', () => {
  it('finds a club by its name in the federation first', () => {
    expect(matchFederationClub('KEMBS ASL TT', clubs, 'agr')?.id).toBe('kembs')
  })

  it('falls back on the display name — Landser before its AGR name is known', () => {
    expect(matchFederationClub('LANDSER ASL', clubs, 'agr')?.id).toBe('landser')
  })

  it('proposes nothing for an unknown or archived club: it is created bare', () => {
    expect(matchFederationClub('SPECHBACH MJC', clubs, 'agr')).toBeUndefined()
    expect(matchFederationClub('MOOSCH ST AUGUSTIN', clubs, 'agr')).toBeUndefined()
  })
})

describe('matchFederationClub within an organisation (#692)', () => {
  const asl = (id: string, organizationId: string) => ({
    id, displayName: 'ASL', isArchived: false,
    affiliations: [{ federationId: 'agr', affiliationNumber: '', name: 'ASL', organizationId }],
  })
  it('never takes a club of the other committee', () => {
    const both = [asl('bas-rhin', 'agr-67'), asl('haut-rhin', 'agr-68')]
    expect(matchFederationClub('ASL', both, 'agr', 'agr-68')?.id).toBe('haut-rhin')
    expect(matchFederationClub('ASL', [both[0]], 'agr', 'agr-68')).toBeUndefined()
  })
})

describe('matchFederationClub beyond the exact name (#730)', () => {
  const fftt = [
    club('club-fftt-06680140', 'Kembs TT', { affiliationNumber: '06680140' }),
    club('club-fftt-06680091', 'Illzach TTSJB', { affiliationNumber: '06680091' }),
    club('club-agr-680036', 'ASL Landser', { affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] }),
    club('mulhouse-1', 'Mulhouse TT', {}),
    club('mulhouse-2', 'ASPTT Mulhouse', {}),
  ]

  it('reads the words in any order — « LANDSER ASL » is « ASL Landser »', () => {
    expect(matchFederationClub('LANDSER ASL', fftt, 'agr')?.id).toBe('club-agr-680036')
  })

  it('proposes the only club of the town: the FFTT’s Kembs and Illzach', () => {
    expect(matchFederationClub('KEMBS ASL TT', fftt, 'agr')?.id).toBe('club-fftt-06680140')
    expect(matchFederationClub('ILLZACH ST JEAN BAPTISTE', fftt, 'agr')?.id).toBe('club-fftt-06680091')
  })

  it('guesses nothing when the town has two clubs', () => {
    expect(matchFederationClub('MULHOUSE CHAMPS', fftt, 'agr')).toBeUndefined()
  })

  it('never takes a club the federation knows under another name', () => {
    const known = [club('k', 'Kembs TT', { affiliations: [{ federationId: 'agr', affiliationNumber: '', name: 'KEMBS ASL TT' }] })]
    expect(matchFederationClub('KEMBS LOISIRS', known, 'agr')).toBeUndefined()
  })
})
