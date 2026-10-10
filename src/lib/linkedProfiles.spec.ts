import { describe, it, expect } from 'vitest'
import type { Club } from '@/types'
import { clubsToAddTo, linkedProfiles, mayEditPerson } from './linkedProfiles'

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
  // #655 — the person is the link, and a parent and a child sharing an address
  // are two people.
  it('finds the profiles of the same person, and not of the same address', () => {
    const gillesA = { id: 'a', email: 'g@club.fr', personId: 'person-g', clubId: 'rixheim' }
    const gillesB = { id: 'b', email: 'g@club.fr', personId: 'person-g', clubId: 'landser' }
    const benjamin = { id: 'ben', email: 'h@club.fr', personId: 'person-ben', clubId: 'rixheim' }
    const sacha = { id: 'sacha', email: 'h@club.fr', personId: 'person-sacha', clubId: 'rixheim' }
    const all = [gillesA, gillesB, benjamin, sacha]
    expect(linkedProfiles(gillesA, all)).toEqual([gillesB])
    expect(linkedProfiles(benjamin, all)).toEqual([])
  })

  it('falls back on the address for a cache that predates people', () => {
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

describe('mayEditPerson (#655)', () => {
  const gillesA = { id: 'a', email: 'g@club.fr', personId: 'person-g', clubId: 'rixheim' }
  const gillesB = { id: 'b', email: 'g@club.fr', personId: 'person-g', clubId: 'landser' }
  const sam = { id: 's', email: 's@club.fr', personId: 'person-s', clubId: 'rixheim' }
  const all = [gillesA, gillesB, sam]

  it("leaves a one-club person to that club's admin, as since #600", () => {
    expect(mayEditPerson(sam, { role: 'club_admin', clubId: 'rixheim' }, all)).toBe(true)
    expect(mayEditPerson(sam, { role: 'club_admin', clubId: 'landser' }, all)).toBe(false)
  })

  it('keeps a person playing in two clubs from the admin of either', () => {
    expect(mayEditPerson(gillesA, { role: 'club_admin', clubId: 'rixheim' }, all)).toBe(false)
    expect(mayEditPerson(gillesB, { role: 'club_admin', clubId: 'landser' }, all)).toBe(false)
  })

  it('lets a general admin, and nobody else', () => {
    expect(mayEditPerson(gillesA, { role: 'general_admin' }, all)).toBe(true)
    expect(mayEditPerson(gillesA, { role: 'player', clubId: 'rixheim' }, all)).toBe(false)
  })
})
