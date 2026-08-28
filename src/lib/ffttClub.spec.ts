import { describe, expect, it } from 'vitest'
import {
  clubSyncFields,
  correspondentName,
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

  // #474 — the <=4-letter rule assumed every short token was an initialism,
  // so the joints of a French place name came out shouting. The cases below
  // are all real club names FFTT publishes.
  describe('short words that are not abbreviations (#474)', () => {
    it('lowercases a preposition between two words', () => {
      expect(normalizeFfttName('MULHOUSE TENNIS DE TABLE')).toBe('Mulhouse Tennis de Table')
      expect(normalizeFfttName('WILLER SUR THUR')).toBe('Willer sur THUR')
      expect(normalizeFfttName('POIX DU NORD')).toBe('POIX du Nord')
      expect(normalizeFfttName('ST PERE EN RETZ')).toBe('St Pere en RETZ')
      expect(normalizeFfttName('SOULTZ SOUS FORETS')).toBe('Soultz sous Forets')
      expect(normalizeFfttName('GENERALI SPORT ET CULTURE')).toBe('Generali Sport et Culture')
    })

    it('knows the regional spellings of lès', () => {
      expect(normalizeFfttName('FLINES LEZ RACHES')).toBe('Flines lez Raches')
      expect(normalizeFfttName('BOURG-LÈS-VALENCE')).toBe('Bourg-lès-Valence')
    })

    // At either end the particle is what the club is called, not a joint.
    it('keeps a particle capitalised at the start or the end', () => {
      expect(normalizeFfttName('LE MONDE DU PINGPONG')).toBe('Le Monde du Pingpong')
      expect(normalizeFfttName('DE GAULLE')).toBe('De Gaulle')
    })

    // "LA" is as often part of the name ("La Robertsau") as a joint inside it
    // ("Beuvry-la-Forêt"), and nothing here can tell the two apart — so it
    // keeps its capital, which is the harmless way to be wrong.
    it('capitalises an article wherever it sits', () => {
      expect(normalizeFfttName('ASL LA ROBERTSAU STRASBOURG')).toBe('ASL La Robertsau Strasbourg')
      expect(normalizeFfttName('AIX LES MILLES')).toBe('Aix Les Milles')
    })

    it('title-cases short words that are words', () => {
      expect(normalizeFfttName('THANN TENNIS DE TABLE CLUB')).toBe('Thann Tennis de Table Club')
      expect(normalizeFfttName('GEMENOS PING')).toBe('Gemenos Ping')
      expect(normalizeFfttName('VAL DE MODER')).toBe('Val de Moder')
      expect(normalizeFfttName('STRASBOURG ST JEAN')).toBe('Strasbourg St Jean')
      expect(normalizeFfttName('ASSUP FOS SUR MER')).toBe('Assup FOS sur Mer')
    })

    // The boundary, stated so nobody mistakes it for a bug: the list cannot
    // hold every French place name, so a short one still reads as an
    // initialism. Better than the alternative, which would title-case "TT".
    it('cannot rescue a short place name that is not on the list', () => {
      expect(normalizeFfttName('WILLER SUR THUR')).toBe('Willer sur THUR')
      expect(normalizeFfttName('ASSUP FOS SUR MER')).toBe('Assup FOS sur Mer')
    })

    it('still leaves a genuine abbreviation alone', () => {
      expect(normalizeFfttName('CSS BERGHEIM')).toBe('CSS Bergheim')
      expect(normalizeFfttName('RIXHEIM PPA')).toBe('Rixheim PPA')
      expect(normalizeFfttName('KEMBS TT')).toBe('Kembs TT')
      expect(normalizeFfttName('ENSISHEIM TTMC')).toBe('Ensisheim TTMC')
    })
  })

  describe('punctuation is glue, kept exactly (#474)', () => {
    // What follows an apostrophe finishes a word, so it is never read as an
    // abbreviation however short — which is also what makes this the one place
    // a 4-letter place name comes out right.
    it('elides d’ and l’ onto the next word', () => {
      expect(normalizeFfttName("VILLENEUVE D'ASCQ CARSAT TT")).toBe("Villeneuve d'Ascq Carsat TT")
      expect(normalizeFfttName("VAL D'OZON TENNIS DE TABLE")).toBe("Val d'Ozon Tennis de Table")
      expect(normalizeFfttName("VALENC'IN PIERRE TT")).toBe("Valenc'In Pierre TT")
    })

    // FFTT is fond of dotted initialisms; title-casing used to mangle them
    // into "C.c.c." because the token is longer than four characters.
    it('leaves a dotted initialism intact', () => {
      expect(normalizeFfttName('COLMAR C.C.C. T.T.')).toBe('Colmar C.C.C. T.T.')
      expect(normalizeFfttName('NORT SUR ERDRE N.A.C.T.T.')).toBe('NORT sur Erdre N.A.C.T.T.')
    })

    // FFTT lists "La Bernerie" as "BERNERIE (LA)", the directory convention.
    it('handles the article FFTT moves into brackets', () => {
      expect(normalizeFfttName('BERNERIE (LA)')).toBe('Bernerie (La)')
      expect(normalizeFfttName('MONTAGNE (LA) A.S.C.')).toBe('Montagne (La) A.S.C.')
    })

    it('leaves digits and spacing where they were', () => {
      expect(normalizeFfttName('PARIS 13 TENNIS DE TABLE')).toBe('Paris 13 Tennis de Table')
      expect(normalizeFfttName('VILLENEUVE EN RETZ   TT')).toBe('Villeneuve en RETZ   TT')
    })

    it('returns a string with no letters unchanged', () => {
      expect(normalizeFfttName('77')).toBe('77')
      expect(normalizeFfttName('')).toBe('')
    })
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
      // The record has always carried a correspondent; #474 started reading it.
      correspondent: {
        lastName: 'Colle',
        firstName: 'Quentin',
        email: 'pparixheim@gmail.com',
        phone: '0672124915',
      },
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

// ---------------------------------------------------------------------------
// The club's official correspondent (#474)
// ---------------------------------------------------------------------------

/** Build a club record with the four *cor fields set to whatever is given. */
const withCorrespondent = (cor: string) =>
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste><club><numero>06680011</numero><nom>RIXHEIM PPA</nom>' +
  '<nomsalle>Complexe Sportif</nomsalle><villesalle>RIXHEIM</villesalle>' +
  cor +
  '</club></liste>'

describe('parseClubDetailXml — correspondent (#474)', () => {
  it('reads the contact FFTT publishes, title-casing the name', () => {
    expect(parseClubDetailXml(RIXHEIM_XML)?.correspondent).toEqual({
      lastName: 'Colle',
      firstName: 'Quentin',
      email: 'pparixheim@gmail.com',
      phone: '0672124915',
    })
  })

  // The address is compared against what a requester typed, so it must survive
  // parsing exactly as published — no lower-casing, no normalisation.
  it('leaves the address untouched, case included', () => {
    const xml = withCorrespondent(
      '<nomcor>BARLINGE</nomcor><prenomcor>Virginie</prenomcor>' +
        '<mailcor>Mulhouse-tennis-de-table@orange.fr</mailcor><telcor>0686839957</telcor>',
    )
    expect(parseClubDetailXml(xml)?.correspondent?.email).toBe(
      'Mulhouse-tennis-de-table@orange.fr',
    )
  })

  it('keeps a partial contact — a name with no address is still someone', () => {
    const xml = withCorrespondent('<nomcor>COLLE</nomcor><prenomcor>Quentin</prenomcor><mailcor/><telcor/>')
    expect(parseClubDetailXml(xml)?.correspondent).toEqual({
      lastName: 'Colle',
      firstName: 'Quentin',
      email: '',
      phone: '',
    })
  })

  it('omits it entirely when all four fields are empty', () => {
    const xml = withCorrespondent('<nomcor/><prenomcor/><mailcor></mailcor><telcor/>')
    expect(parseClubDetailXml(xml)?.correspondent).toBeUndefined()
  })

  it('omits it when the fields are absent altogether', () => {
    expect(parseClubDetailXml(withCorrespondent(''))?.correspondent).toBeUndefined()
  })

  it('does not disturb the rest of the record', () => {
    const parsed = parseClubDetailXml(RIXHEIM_XML)
    expect(parsed?.displayName).toBe('Rixheim PPA')
    expect(parsed?.city).toBe('Rixheim')
  })
})

describe('correspondentName (#474)', () => {
  it('reads as a person', () => {
    expect(correspondentName({ firstName: 'Quentin', lastName: 'Colle', email: '', phone: '' }))
      .toBe('Quentin Colle')
  })

  it('copes with half a name, and with nobody at all', () => {
    expect(correspondentName({ firstName: '', lastName: 'Colle', email: '', phone: '' })).toBe('Colle')
    expect(correspondentName(null)).toBe('')
    expect(correspondentName(undefined)).toBe('')
  })
})
