import { describe, it, expect } from 'vitest'
import type { Address, Club, Team } from '../types'
import { getMatchVenue, getVenue, venueText } from './venue'

const hall: Address = {
  id: 'a-hall', label: 'Gymnase Jules Ferry', street: '3 rue de l’École', postalCode: '68170', city: 'Rixheim', isDefault: false,
}
const seat: Address = {
  id: 'a-seat', label: 'Siège', street: '12 rue du Stade', postalCode: '68170', city: 'Rixheim', isDefault: true,
}
const club = (addresses: Address[], displayName = 'PPA Rixheim'): Club => ({
  id: 'c1', affiliationNumber: '06680011', displayName, isArchived: false, addresses, channels: [],
})
const team = (gameLocationId: string): Team => ({
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 1, divisionId: 'd1', groupId: 'g1', gameLocationId,
  defaultDay: 'Samedi', defaultTime: '16h00', captainId: '', isArchived: false, playerIds: [],
})

describe('getMatchVenue (#611)', () => {
  it("names the hall the home team plays in, with its address", () => {
    expect(getMatchVenue(team('a-hall'), [club([seat, hall])])).toEqual({ kind: 'address', name: 'Gymnase Jules Ferry', address: hall })
  })

  it("falls back to the club's default address, unnamed", () => {
    // The fallback is a guess at where they play: naming it « Siège » would
    // claim a venue nobody set.
    expect(getMatchVenue(team(''), [club([hall, seat])])).toEqual({ kind: 'address', name: undefined, address: seat })
  })

  it("falls back to the town in the club's name when no address is on file", () => {
    // An opponent created by an import, which FFTT could not fill (#613).
    expect(getMatchVenue(team(''), [club([], 'RIXHEIM PPA')])).toEqual({ kind: 'town', town: 'Rixheim' })
    expect(getVenue(team(''), [club([], 'RIXHEIM PPA')])).toBe('Rixheim')
  })

  it('takes a blank address for no address', () => {
    const blank = { ...seat, street: '', postalCode: '', city: '' }
    expect(getMatchVenue(team(''), [club([blank])])).toEqual({ kind: 'town', town: 'Rixheim' })
  })

  it('knows nothing when neither an address nor a town is to be had', () => {
    expect(getMatchVenue(team(''), [club([], 'A.S.C. TENNIS DE TABLE')])).toBeUndefined()
    expect(getMatchVenue(undefined, [club([seat])])).toBeUndefined()
  })

  it('agrees with the short label the lists print', () => {
    expect(getVenue(team('a-hall'), [club([seat, hall])])).toBe('Gymnase Jules Ferry, Rixheim')
    expect(getVenue(team(''), [club([seat])])).toBe('Rixheim')
  })
})

describe('venueText', () => {
  it('prints the hall and its address, and searches the address', () => {
    expect(venueText({ kind: 'address', name: 'Gymnase Jules Ferry', address: hall })).toEqual({
      name: 'Gymnase Jules Ferry', line: '3 rue de l’École, 68170 Rixheim', query: '3 rue de l’École, 68170 Rixheim',
    })
  })

  it('prints a town alone, and searches it in France', () => {
    expect(venueText({ kind: 'town', town: 'Etival' })).toEqual({ line: 'Etival', query: 'Etival, France' })
  })
})
