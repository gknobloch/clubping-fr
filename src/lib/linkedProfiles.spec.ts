import { describe, it, expect } from 'vitest'
import type { Club } from '@/types'
import { clubsToAddTo, linkedProfiles } from './linkedProfiles'

// #644 — Gilles at Rixheim (FFTT) and at Landser (AGR): two profiles, one
// address. The address is the whole link, compared as at sign-in.

const club = (id: string, over: Partial<Club> = {}): Club => ({
  id, affiliationNumber: '', displayName: id, isArchived: false, addresses: [], channels: [], ...over,
})
const RIXHEIM = club('rixheim')
const LANDSER = club('landser')
const KEMBS = club('kembs')
const OLD = club('old', { isArchived: true })
const clubs = [RIXHEIM, LANDSER, KEMBS, OLD]

const gillesRixheim = { id: 'g1', email: 'gilles@club.fr', clubId: 'rixheim' }
const gillesLandser = { id: 'g2', email: ' Gilles@Club.FR ', clubId: 'landser' }
const someone = { id: 'x', email: 'other@club.fr', clubId: 'rixheim' }
const nobody = { id: 'n', clubId: 'rixheim' }
const players = [gillesRixheim, gillesLandser, someone, nobody]

describe('linkedProfiles', () => {
  it('finds the other profiles of the same address, case aside', () => {
    expect(linkedProfiles(gillesRixheim, players)).toEqual([gillesLandser])
  })

  it('links nothing without an address', () => {
    expect(linkedProfiles(nobody, [...players, { id: 'n2', clubId: 'landser' }])).toEqual([])
  })
})

describe('clubsToAddTo', () => {
  it('offers a general admin every club the licensee is not in yet', () => {
    expect(clubsToAddTo(gillesRixheim, { role: 'general_admin' }, clubs, players).map((c) => c.id))
      .toEqual(['kembs'])
  })

  it('offers a club admin their own club, and only if the licensee is not in it', () => {
    expect(clubsToAddTo(someone, { role: 'club_admin', clubId: 'landser' }, clubs, players).map((c) => c.id))
      .toEqual(['landser'])
    expect(clubsToAddTo(gillesRixheim, { role: 'club_admin', clubId: 'landser' }, clubs, players)).toEqual([])
    expect(clubsToAddTo(someone, { role: 'club_admin', clubId: 'rixheim' }, clubs, players)).toEqual([])
  })

  it('offers a player nothing', () => {
    expect(clubsToAddTo(someone, { role: 'player', clubId: 'landser' }, clubs, players)).toEqual([])
  })
})
