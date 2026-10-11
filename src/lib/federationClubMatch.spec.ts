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
