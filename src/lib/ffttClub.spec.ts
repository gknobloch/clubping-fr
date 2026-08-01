import { describe, expect, it } from 'vitest'
import {
  clubSyncFields,
  defaultSelectedFields,
  formatVenue,
  hasVenueInfo,
  normalizeFfttName,
  parseClubDetailXml,
} from './ffttClub'

const RIXHEIM_XML =
  '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
  '<liste><club><idclub>2680011</idclub><numero>06680011</numero><nom>RIXHEIM PPA</nom>' +
  '<nomsalle>Complexe Sportif</nomsalle><adressesalle1>5, rue Vaclav Havel</adressesalle1>' +
  '<adressesalle2/><adressesalle3></adressesalle3><codepsalle>68170</codepsalle>' +
  '<villesalle>RIXHEIM</villesalle><web/><nomcor>COLLE</nomcor><prenomcor>Quentin</prenomcor>' +
  '<mailcor>pparixheim@gmail.com</mailcor><telcor>0672124915</telcor>' +
  '<latitude>47.761898</latitude><longitude>7.394756</longitude>' +
  '<validation>06/07/2026</validation></club></liste>'

describe('normalizeFfttName', () => {
  it('title-cases a plain all-caps place name', () => {
    expect(normalizeFfttName('BERGHEIM')).toBe('Bergheim')
  })

  it('keeps short tokens (<=4 letters) as-is, treating them as abbreviations', () => {
    expect(normalizeFfttName('CSS BERGHEIM')).toBe('CSS Bergheim')
    expect(normalizeFfttName('CPPC MULHOUSE')).toBe('CPPC Mulhouse')
    expect(normalizeFfttName('RIXHEIM PPA')).toBe('Rixheim PPA')
    expect(normalizeFfttName('KEMBS TT')).toBe('Kembs TT')
  })

  it('title-cases each hyphenated segment independently', () => {
    expect(normalizeFfttName('SAINT-LOUIS')).toBe('Saint-Louis')
  })

  it('handles accented uppercase letters', () => {
    expect(normalizeFfttName('ÉTIVAL')).toBe('Étival')
  })
})

describe('hasVenueInfo', () => {
  it('is true when any address field is present', () => {
    expect(hasVenueInfo({ street: '5, rue de la Gare', postalCode: '', city: '' })).toBe(true)
    expect(hasVenueInfo({ street: '', postalCode: '68170', city: '' })).toBe(true)
    expect(hasVenueInfo({ street: '', postalCode: '', city: 'Rixheim' })).toBe(true)
  })

  it('is false when street, postal code and city are all empty', () => {
    expect(hasVenueInfo({ street: '', postalCode: '', city: '' })).toBe(false)
  })
})

describe('parseClubDetailXml', () => {
  it('parses a real xml_club_detail.php response, normalizing name and city casing', () => {
    expect(parseClubDetailXml(RIXHEIM_XML)).toEqual({
      affiliationNumber: '06680011',
      displayName: 'Rixheim PPA',
      venueLabel: 'Complexe Sportif',
      street: '5, rue Vaclav Havel',
      postalCode: '68170',
      city: 'Rixheim',
    })
  })

  it('joins non-empty address lines 1-3', () => {
    const xml = RIXHEIM_XML.replace('<adressesalle2/>', '<adressesalle2>Bâtiment B</adressesalle2>')
    expect(parseClubDetailXml(xml)?.street).toBe('5, rue Vaclav Havel, Bâtiment B')
  })

  it('returns an empty (not defaulted) venueLabel when nomsalle is absent', () => {
    const xml = RIXHEIM_XML.replace('<nomsalle>Complexe Sportif</nomsalle>', '<nomsalle/>')
    expect(parseClubDetailXml(xml)?.venueLabel).toBe('')
  })

  it('returns null when the club number is unknown (empty liste)', () => {
    expect(parseClubDetailXml('<?xml version="1.0"?><liste></liste>')).toBeNull()
  })

  it('returns null on malformed XML', () => {
    expect(parseClubDetailXml('not xml at all <<<')).toBeNull()
  })

  it('returns null when numero or nom is missing', () => {
    const xml = '<liste><club><nomsalle>Salle</nomsalle></club></liste>'
    expect(parseClubDetailXml(xml)).toBeNull()
  })
})

describe('clubSyncFields', () => {
  const incoming = {
    displayName: 'Rixheim PPA',
    venueLabel: 'Gymnase',
    street: '1 rue du Sport',
    postalCode: '68170',
    city: 'Rixheim',
  }
  const field = (fs: ReturnType<typeof clubSyncFields>, key: string) => fs.find((f) => f.key === key)!

  it('marks a differing field as importable, with both sides shown', () => {
    const fs = clubSyncFields(incoming, { displayName: 'PPA Rixheim', venue: null })
    const name = field(fs, 'displayName')
    expect(name.current).toBe('PPA Rixheim')
    expect(name.incoming).toBe('Rixheim PPA')
    expect(name.unchanged).toBe(false)
    expect(name.unavailable).toBe(false)
  })

  it('marks an identical field unchanged so it cannot be selected', () => {
    const fs = clubSyncFields(incoming, { displayName: 'Rixheim PPA', venue: null })
    expect(field(fs, 'displayName').unchanged).toBe(true)
  })

  it('treats a venue FFTT does not have as unavailable rather than an erasure', () => {
    const fs = clubSyncFields(
      { ...incoming, street: '', postalCode: '', city: '' },
      { displayName: 'X', venue: { label: 'Salle', street: '2 rue A', postalCode: '68000', city: 'Colmar' } },
    )
    const venue = field(fs, 'venue')
    expect(venue.unavailable).toBe(true)
    expect(venue.incoming).toBeNull()
    expect(venue.current).toBe('Salle · 2 rue A, 68000 Colmar')
    expect(defaultSelectedFields(fs).has('venue')).toBe(false)
  })

  it('leaves every current value null for a club being created', () => {
    const fs = clubSyncFields(incoming)
    expect(fs.every((f) => f.current === null)).toBe(true)
    expect([...defaultSelectedFields(fs)].sort()).toEqual(['displayName', 'venue'])
  })

  it('detects an identical venue even when spelled through separate parts', () => {
    const fs = clubSyncFields(incoming, {
      displayName: 'Rixheim PPA',
      venue: { label: 'Gymnase', street: '1 rue du Sport', postalCode: '68170', city: 'Rixheim' },
    })
    expect(field(fs, 'venue').unchanged).toBe(true)
    expect(defaultSelectedFields(fs).size).toBe(0)
  })

  it('formats a venue as one line, or null when empty', () => {
    expect(formatVenue({ label: 'Salle', street: '', postalCode: '', city: 'Thann' })).toBe('Salle · Thann')
    expect(formatVenue({ label: '', street: '', postalCode: '', city: '' })).toBeNull()
    expect(formatVenue(null)).toBeNull()
  })
})
