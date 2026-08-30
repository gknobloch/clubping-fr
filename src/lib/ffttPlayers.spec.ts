import { describe, expect, it } from 'vitest'
import {
  buildImportRows,
  findImportCandidate,
  dafunkerClubLicencesUrl,
  dafunkerLicenceUrl,
  formatPoints,
  normalizePersonName,
  parseClubLicencesXml,
  playerSyncFields,
  playersMissingFromFftt,
  sameClubNumber,
  writableFields,
} from './ffttPlayers'
import type { Player, PlayerPhasePoints } from '../types'

// The real xml_licence_b.php?licence=684545 response — the single-licence
// scope answers with the same record shape as the club-wide one.
const ONE_LICENCE_XML =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste><licence><idlicence>45574</idlicence><licence>684545</licence><nom>CERONI</nom>' +
  '<prenom>Herve</prenom><numclub>06680011</numclub><nomclub>RIXHEIM PPA</nomclub>' +
  '<sexe>M</sexe><type>A</type><point>1416</point><cat>V55</cat><pointm>1416</pointm>' +
  '<apointm>1435.97</apointm><initm>1500</initm></licence></liste>'

// The real xml_licence_b.php?club=06680011 response, two records of it.
const CLUB_XML =
  '<liste>' +
  '<licence><idlicence>41142</idlicence><licence>425881</licence><nom>CANAQUE</nom>' +
  '<prenom>Gregory</prenom><numclub>06680011</numclub><nomclub>RIXHEIM PPA</nomclub>' +
  '<sexe>M</sexe><type>A</type><point>1731</point><cat>V40</cat><pointm>1731</pointm>' +
  '<apointm>1752.34</apointm><initm>1763</initm></licence>' +
  '<licence><idlicence>53437</idlicence><licence>392885</licence><nom>CLEMENT</nom>' +
  '<prenom>Didier</prenom><numclub>06680011</numclub><nomclub>RIXHEIM PPA</nomclub>' +
  '<sexe>M</sexe><type>T</type><point>772</point><cat>V45</cat><pointm>772</pointm>' +
  '<apointm>778.34</apointm><initm>889.</initm></licence>' +
  '</liste>'

const player = (over: Partial<Player>): Player => ({
  id: 'p-1', firstName: 'Bertrand', lastName: 'De Coatpont', licenseNumber: '6813454',
  phone: '', status: 'active', clubId: 'club-fftt-06680011', ...over,
})

describe('normalizePersonName', () => {
  it('title-cases the all-caps family names FFTT sends', () => {
    expect(normalizePersonName('CANAQUE')).toBe('Canaque')
  })

  it('keeps particles lowercase inside the name — the "DE COATPONT" case', () => {
    expect(normalizePersonName('DE COATPONT')).toBe('De Coatpont')
    expect(normalizePersonName('Bertrand DE COATPONT')).toBe('Bertrand de Coatpont')
    expect(normalizePersonName('VAN DEN BERG')).toBe('Van den Berg')
  })

  // normalizeFfttName (ffttClub.ts) leaves <=4-letter tokens alone because they
  // are club abbreviations (TT, PPA); on a person that gives "DE Coatpont".
  it('does not treat a short token as an abbreviation', () => {
    expect(normalizePersonName('LE GUEN')).toBe('Le Guen')
    expect(normalizePersonName('COT')).toBe('Cot')
  })

  it('title-cases each segment of a compound name', () => {
    expect(normalizePersonName('JEAN-PIERRE')).toBe('Jean-Pierre')
    expect(normalizePersonName("D'ANGELO")).toBe("D'Angelo")
  })

  it('handles accents and already-normalized input', () => {
    expect(normalizePersonName('MÜLLER')).toBe('Müller')
    expect(normalizePersonName('Gregory')).toBe('Gregory')
    expect(normalizePersonName('')).toBe('')
  })
})

describe('formatPoints', () => {
  it('drops the decimal part JSON adds to a whole number', () => {
    expect(formatPoints(803.0)).toBe('803')
    expect(formatPoints('1731')).toBe('1731')
  })

  it('keeps a genuinely fractional value as stated', () => {
    expect(formatPoints('788.34')).toBe('788.34')
  })

  it('is empty for anything that is not a number', () => {
    expect(formatPoints('')).toBe('')
    expect(formatPoints(null)).toBe('')
    expect(formatPoints(undefined)).toBe('')
    expect(formatPoints('n/a')).toBe('')
  })
})

describe('sameClubNumber', () => {
  it('matches the same affiliation number whatever the punctuation', () => {
    expect(sameClubNumber('06680011', '06680011')).toBe(true)
    expect(sameClubNumber('06680011', '06 68 00 11')).toBe(true)
  })

  it('never matches on an empty number', () => {
    expect(sameClubNumber('', '')).toBe(false)
    expect(sameClubNumber('06680011', undefined)).toBe(false)
  })

  it('rejects a different club', () => {
    expect(sameClubNumber('06680011', '06680125')).toBe(false)
  })
})

describe('urls', () => {
  // Both scopes go through /v1/proxy/: the friendlier /v1/joueur/<licence>
  // JSON endpoint answers without an Access-Control-Allow-Origin header, so
  // the browser blocks it (the import runs in the page, not on the server).
  it('builds both scopes on the CORS-enabled proxy, stripping anything else', () => {
    expect(dafunkerLicenceUrl('684545'))
      .toBe('https://fftt.dafunker.com/v1/proxy/xml_licence_b.php?licence=684545')
    expect(dafunkerLicenceUrl('68 45 45'))
      .toBe('https://fftt.dafunker.com/v1/proxy/xml_licence_b.php?licence=684545')
    expect(dafunkerClubLicencesUrl('06680011'))
      .toBe('https://fftt.dafunker.com/v1/proxy/xml_licence_b.php?club=06680011')
  })
})

describe('parseClubLicencesXml', () => {
  it('parses a single-licence response the same way as a club list', () => {
    expect(parseClubLicencesXml(ONE_LICENCE_XML)).toEqual([{
      licence: '684545', lastName: 'Ceroni', firstName: 'Herve',
      clubNumber: '06680011', clubName: 'Rixheim PPA', points: '1416',
    }])
  })

  it('parses every record, taking the licence NUMBER and not idlicence', () => {
    expect(parseClubLicencesXml(CLUB_XML)).toEqual([
      {
        licence: '425881', lastName: 'Canaque', firstName: 'Gregory',
        clubNumber: '06680011', clubName: 'Rixheim PPA', points: '1731',
      },
      {
        licence: '392885', lastName: 'Clement', firstName: 'Didier',
        clubNumber: '06680011', clubName: 'Rixheim PPA', points: '772',
      },
    ])
  })

  it('returns nothing for an empty or broken list', () => {
    expect(parseClubLicencesXml('<liste></liste>')).toEqual([])
    expect(parseClubLicencesXml('nonsense')).toEqual([])
  })
})

const LICENCE = {
  licence: '6813454', lastName: 'De Coatpont', firstName: 'Bertrand',
  clubNumber: '06680011', clubName: 'Rixheim PPA', points: '803',
}

describe('playerSyncFields', () => {
  it('marks everything as new when there is no current player', () => {
    const fields = playerSyncFields(LICENCE)
    expect(fields.map((f) => f.current)).toEqual([null, null, null, null])
    expect(writableFields(fields).map((f) => f.key)).toEqual([
      'lastName', 'firstName', 'licenseNumber', 'points',
    ])
  })

  it('only offers what actually differs', () => {
    const fields = playerSyncFields(LICENCE, {
      lastName: 'DE COATPONT', firstName: 'Bertrand', licenseNumber: '6813454', points: '803',
    })
    expect(writableFields(fields).map((f) => f.key)).toEqual(['lastName'])
    expect(fields.find((f) => f.key === 'lastName')).toMatchObject({
      current: 'DE COATPONT', incoming: 'De Coatpont', unchanged: false,
    })
    expect(fields.find((f) => f.key === 'points')?.unchanged).toBe(true)
  })

  // FFTT exports names unaccented on both endpoints ("Herve", "Gregory",
  // "Clement"). Taking that would strip the accents off half a French club.
  it('does not "correct" an accented name into FFTT’s unaccented one', () => {
    const fields = playerSyncFields(
      { ...LICENCE, lastName: 'Ceroni', firstName: 'Herve' },
      { lastName: 'Ceroni', firstName: 'Hervé', licenseNumber: '6813454', points: '803' },
    )
    expect(fields.find((f) => f.key === 'firstName')?.unchanged).toBe(true)
    expect(writableFields(fields)).toEqual([])
  })

  it('still offers a name that differs by more than accents', () => {
    const fields = playerSyncFields(LICENCE, {
      lastName: 'DE COATPONT', firstName: 'Bertrand', licenseNumber: '6813454', points: '803',
    })
    expect(writableFields(fields).map((f) => f.key)).toEqual(['lastName'])
  })

  it('offers nothing for a field FFTT left empty', () => {
    const fields = playerSyncFields({ ...LICENCE, points: '' }, {
      lastName: 'De Coatpont', firstName: 'Bertrand', licenseNumber: '6813454', points: '803',
    })
    expect(fields.find((f) => f.key === 'points')).toMatchObject({ unavailable: true })
    expect(writableFields(fields)).toEqual([])
  })
})

describe('buildImportRows', () => {
  const points: PlayerPhasePoints[] = [
    { phaseId: 'phase-27-1', playerId: 'p-1', points: '727' },
  ]

  it('matches on the licence number, not on the name', () => {
    const rows = buildImportRows([LICENCE], [player({ lastName: 'Coatpont' })], points, 'phase-27-1')
    expect(rows[0].playerId).toBe('p-1')
    expect(rows[0].status).toBe('changed')
    expect(writableFields(rows[0].fields).map((f) => f.key)).toEqual(['lastName', 'points'])
  })

  it('reports a licence we do not hold as new', () => {
    const rows = buildImportRows([LICENCE], [], [], 'phase-27-1')
    expect(rows[0].status).toBe('new')
    expect(rows[0].playerId).toBeUndefined()
  })

  it('reports a player already up to date as unchanged', () => {
    const rows = buildImportRows(
      [LICENCE],
      [player({})],
      [{ phaseId: 'phase-27-1', playerId: 'p-1', points: '803' }],
      'phase-27-1',
    )
    expect(rows[0].status).toBe('unchanged')
    expect(writableFields(rows[0].fields)).toEqual([])
  })

  it('reads the points of the target phase, not of another one', () => {
    const rows = buildImportRows(
      [LICENCE],
      [player({})],
      [{ phaseId: 'phase-26-2', playerId: 'p-1', points: '803' }],
      'phase-27-1',
    )
    expect(rows[0].fields.find((f) => f.key === 'points')).toMatchObject({
      current: null, incoming: '803',
    })
  })
})

describe('playersMissingFromFftt', () => {
  it('lists the licensees FFTT no longer mentions', () => {
    const gone = player({ id: 'p-2', licenseNumber: '999999', lastName: 'Parti' })
    expect(playersMissingFromFftt([LICENCE], [player({}), gone])).toEqual([gone])
  })
})

// #474 — an approved club admin is a `users` row with no licence, and when
// they hold none, `is_player = 0` keeps them out of `players` entirely. The
// licence match therefore could not see them, and importing the club's
// licensees created the same person a second time.

describe('findImportCandidate (#474)', () => {
  const admin = { id: 'u1', firstName: 'Virginie', lastName: 'Barlinge' }
  const licence = { firstName: 'Virginie', lastName: 'Barlinge' }

  it('offers the member holding no licence who bears the same name', () => {
    expect(findImportCandidate(licence, [admin])).toEqual(admin)
  })

  it('ignores case and surrounding space, as names arrive either way', () => {
    expect(
      findImportCandidate({ firstName: ' virginie ', lastName: 'BARLINGE' }, [admin]),
    ).toEqual(admin)
  })

  it('never offers someone who already holds a different licence', () => {
    expect(findImportCandidate(licence, [{ ...admin, licenseNumber: '999999' }])).toBeNull()
  })

  // Two namesakes in one club is a question this cannot answer, and answering
  // it wrongly fuses two members permanently.
  it('offers nobody when two members share the name', () => {
    expect(findImportCandidate(licence, [admin, { ...admin, id: 'u2' }])).toBeNull()
  })

  it('offers nobody when no name matches', () => {
    expect(findImportCandidate(licence, [{ id: 'u3', firstName: 'Quentin', lastName: 'Colle' }])).toBeNull()
  })
})

describe('buildImportRows — linking rather than duplicating (#474)', () => {
  const licence = {
    licence: '425881', lastName: 'Barlinge', firstName: 'Virginie',
    clubNumber: '06680105', clubName: 'Mulhouse TT', points: '1200',
  }
  const admin = { id: 'u1', firstName: 'Virginie', lastName: 'Barlinge' }

  it('suggests the existing member instead of silently creating a second', () => {
    const [row] = buildImportRows([licence], [], [], 'phase-27-1', [admin])
    expect(row.status).toBe('new')
    expect(row.link).toEqual({ id: 'u1', on: 'name', name: 'Virginie Barlinge' })
  })

  // A suggestion is a question, not a decision: the row still reads as new
  // until an admin ticks it.
  it('leaves the row unlinked when there is nobody to suggest', () => {
    const [row] = buildImportRows([licence], [], [], 'phase-27-1', [])
    expect(row.status).toBe('new')
    expect(row.link).toBeUndefined()
  })

  it('prefers a licence match, which needs no confirming at all', () => {
    const licensee = {
      id: 'p1', firstName: 'Virginie', lastName: 'Barlinge', licenseNumber: '425881',
      email: 'v@example.fr', phone: '', status: 'active' as const, clubId: 'club-fftt-06680105',
    }
    const [row] = buildImportRows([licence], [licensee], [], 'phase-27-1', [admin])
    expect(row.playerId).toBe('p1')
    expect(row.link).toBeUndefined()
  })

  it('is unchanged for callers that pass no candidates', () => {
    const [row] = buildImportRows([licence], [], [], 'phase-27-1')
    expect(row.status).toBe('new')
    expect(row.link).toBeUndefined()
  })
})
