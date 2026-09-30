import { describe, it, expect, vi } from 'vitest'
import type { Club } from '../types'
import { clubsMissingVenue, fillVenuesFromFftt, venueFromClubDetailXml } from './clubVenues'

const club = (id: string, over: Partial<Club> = {}): Club => ({
  id, affiliationNumber: id.replace('club-', ''), displayName: id, isArchived: false, addresses: [], channels: [],
  ...over,
})

const detail = (numero: string, salle: { nom?: string; adresse?: string; cp?: string; ville?: string }) =>
  `<liste><club><numero>${numero}</numero><nom>CLUB ${numero}</nom>` +
  `<nomsalle>${salle.nom ?? ''}</nomsalle><adressesalle1>${salle.adresse ?? ''}</adressesalle1>` +
  `<codepsalle>${salle.cp ?? ''}</codepsalle><villesalle>${salle.ville ?? ''}</villesalle></club></liste>`

describe('clubsMissingVenue (#613)', () => {
  it('asks only about live clubs with a number and no address', () => {
    const clubs = [
      club('club-1'),
      club('club-2', { addresses: [{ id: 'a', label: 'Salle', street: 'x', postalCode: '1', city: 'y', isDefault: true }] }),
      club('club-3', { isArchived: true }),
      club('club-4', { affiliationNumber: '' }),
    ]
    expect(clubsMissingVenue(clubs).map((c) => c.id)).toEqual(['club-1'])
  })
})

describe('venueFromClubDetailXml', () => {
  it('reads the hall, its address and its town', () => {
    expect(venueFromClubDetailXml(detail('1', { nom: 'Gymnase Jean Moulin', adresse: '3 rue du Stade', cp: '88000', ville: 'EPINAL' })))
      .toEqual({ label: 'Gymnase Jean Moulin', street: '3 rue du Stade', postalCode: '88000', city: 'Epinal' })
  })

  it('names an unnamed hall « Salle », and keeps a town with no street', () => {
    expect(venueFromClubDetailXml(detail('1', { ville: 'EPINAL' })))
      .toEqual({ label: 'Salle', street: '', postalCode: '', city: 'Epinal' })
  })

  it('gives nothing when FFTT names no place at all', () => {
    expect(venueFromClubDetailXml(detail('1', { nom: 'Gymnase' }))).toBeNull()
    expect(venueFromClubDetailXml('<liste></liste>')).toBeNull()
  })
})

describe('fillVenuesFromFftt', () => {
  it('writes each hall FFTT gives, and tallies what it could not', async () => {
    const xml: Record<string, string | null> = {
      '1': detail('1', { adresse: '3 rue du Stade', cp: '88000', ville: 'EPINAL' }),
      '2': detail('2', {}),
      '3': null,
      '4': detail('4', { ville: 'VITTEL' }),
    }
    const write = vi.fn(async (clubId: string) => clubId !== 'club-4')
    const progress = vi.fn()

    const result = await fillVenuesFromFftt(
      ['club-1', 'club-2', 'club-3', 'club-4'].map((id) => club(id)),
      { fetchXml: async (n) => xml[n], write, onProgress: progress },
    )

    expect(result).toEqual({ filled: 1, noInfo: 1, failed: 2 })
    expect(write).toHaveBeenCalledWith('club-1', { label: 'Salle', street: '3 rue du Stade', postalCode: '88000', city: 'Epinal' })
    expect(write).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenLastCalledWith(4, 4)
  })

  it('asks FFTT nothing when every club already has its address', async () => {
    const fetchXml = vi.fn()
    const addressed = club('club-1', {
      addresses: [{ id: 'a', label: 'Salle', street: 'x', postalCode: '1', city: 'y', isDefault: true }],
    })
    expect(await fillVenuesFromFftt([addressed], { fetchXml, write: vi.fn() }))
      .toEqual({ filled: 0, noInfo: 0, failed: 0 })
    expect(fetchXml).not.toHaveBeenCalled()
  })
})
