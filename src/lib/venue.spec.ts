import { describe, it, expect } from 'vitest'
import type { Address, Club, Team } from '../types'
import { getMatchVenue, getVenue } from './venue'

const hall: Address = {
  id: 'a-hall', label: 'Gymnase Jules Ferry', street: '3 rue de l’École', postalCode: '68170', city: 'Rixheim', isDefault: false,
}
const seat: Address = {
  id: 'a-seat', label: 'Siège', street: '12 rue du Stade', postalCode: '68170', city: 'Rixheim', isDefault: true,
}
const club = (addresses: Address[]): Club => ({
  id: 'c1', affiliationNumber: '06680011', displayName: 'PPA Rixheim', isArchived: false, addresses, channels: [],
})
const team = (gameLocationId: string): Team => ({
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 1, divisionId: 'd1', groupId: 'g1', gameLocationId,
  defaultDay: 'Samedi', defaultTime: '16h00', captainId: '', isArchived: false, playerIds: [],
})

describe('getMatchVenue (#611)', () => {
  it("names the hall the home team plays in, with its address", () => {
    expect(getMatchVenue(team('a-hall'), [club([seat, hall])])).toEqual({ name: 'Gymnase Jules Ferry', address: hall })
  })

  it("falls back to the club's default address, unnamed", () => {
    // The fallback is a guess at where they play: naming it « Siège » would
    // claim a venue nobody set.
    expect(getMatchVenue(team(''), [club([hall, seat])])).toEqual({ name: undefined, address: seat })
  })

  it('knows nothing of a club with no address on file', () => {
    // An opponent created by an import: the usual away match.
    expect(getMatchVenue(team(''), [club([])])).toBeUndefined()
    expect(getMatchVenue(undefined, [club([seat])])).toBeUndefined()
  })

  it('takes a blank address for no address', () => {
    const blank = { ...seat, street: '', postalCode: '', city: '' }
    expect(getMatchVenue(team(''), [club([blank])])).toBeUndefined()
  })

  it('agrees with the short label the lists print', () => {
    expect(getVenue(team('a-hall'), [club([seat, hall])])).toBe('Gymnase Jules Ferry, Rixheim')
    expect(getVenue(team(''), [club([seat])])).toBe('Rixheim')
  })
})
