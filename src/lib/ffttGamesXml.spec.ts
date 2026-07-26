import { describe, expect, it } from 'vitest'
import {
  dafunkerClubTeamsUrl, dafunkerResultsUrl, parseDafunkerClubTeamsXml, parseDafunkerResultsXml,
} from './ffttGamesXml'

// Real response captured from xml_equipe.php?force=1&numclu=06680011 (Rixheim
// PPA), trimmed to two teams.
const CLUB_TEAMS_XML =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste>' +
  '<equipe><idepr>18368</idepr><libepr>FED_Championnat de France par Equipes Masculin</libepr>' +
  '<idequipe>5458</idequipe><libequipe>RIXHEIM PPA  1 - Phase 1</libequipe>' +
  '<libdivision>GE Elite P1 Poule 3</libdivision>' +
  '<liendivision><![CDATA[cx_poule=1502291&D1=234142&organisme_pere=14]]></liendivision></equipe>' +
  '<equipe><idepr>18368</idepr><libepr>FED_Championnat de France par Equipes Masculin</libepr>' +
  '<idequipe>3354</idequipe><libequipe>RIXHEIM PPA  2 - Phase 1</libequipe>' +
  '<libdivision>GE 2 Phase 1 Poule 9</libdivision>' +
  '<liendivision><![CDATA[cx_poule=1502306&D1=234461&organisme_pere=14]]></liendivision></equipe>' +
  '</liste>'

// Real tour entries captured from xml_result_equ.php?force=1&D1=234461
// (Poule 1), plus a second poule synthesized from the CDATA payload shared
// during development (Poule 2, ETIVAL 4 vs ROSENAU TT 2) to exercise
// multi-pool grouping.
const RESULTS_XML =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste>' +
  '<tour><libelle>Poule 1 - tour n°1 du 20/09/2026</libelle>' +
  '<equa>BAZEILLES PPC 3</equa><equb>CHALONS-EN-C TT 2</equb><scorea/><scoreb/>' +
  '<lien><![CDATA[renc_id=6491024&is_retour=0&phase=1&res_1=&res_2=&equip_1=BAZEILLES+PPC+3&equip_2=CHALONS-EN-C+TT+2&equip_id1=3830&equip_id2=4975&clubnum_1=06080006&clubnum_2=06510112]]></lien>' +
  '<dateprevue>20/09/2026</dateprevue><datereelle>20/09/2026</datereelle></tour>' +
  '<tour><libelle>Poule 1 - tour n°2 du 04/10/2026</libelle>' +
  '<equa>TROYES OS-NOES 4</equa><equb>BAZEILLES PPC 3</equb><scorea/><scoreb/>' +
  '<lien><![CDATA[renc_id=6491028&is_retour=0&phase=1&res_1=&res_2=&equip_1=TROYES+OS-NOES+4&equip_2=BAZEILLES+PPC+3&equip_id1=3809&equip_id2=3830&clubnum_1=06100002&clubnum_2=06080006]]></lien>' +
  '<dateprevue>04/10/2026</dateprevue><datereelle>11/10/2026</datereelle></tour>' +
  '<tour><libelle>Poule 2 - tour n°1 du 20/09/2026</libelle>' +
  '<equa>ETIVAL 4</equa><equb>ROSENAU TT  2</equb><scorea/><scoreb/>' +
  '<lien><![CDATA[renc_id=6491248&is_retour=0&phase=1&res_1=&res_2=&equip_1=ETIVAL+4&equip_2=ROSENAU+TT++2&equip_id1=1075&equip_id2=2017&clubnum_1=06880123&clubnum_2=06680125]]></lien>' +
  '<dateprevue>20/09/2026</dateprevue><datereelle>20/09/2026</datereelle></tour>' +
  '</liste>'

describe('dafunkerResultsUrl', () => {
  it('builds the division results URL, sanitizing the division id', () => {
    expect(dafunkerResultsUrl('234461')).toBe(
      'https://fftt.dafunker.com/v1/proxy/xml_result_equ.php?force=1&D1=234461',
    )
    expect(dafunkerResultsUrl('234a461x')).toBe(
      'https://fftt.dafunker.com/v1/proxy/xml_result_equ.php?force=1&D1=234461',
    )
  })

  it('appends a sanitized cx_poule when targeting a specific pool', () => {
    expect(dafunkerResultsUrl('234461', '1502306')).toBe(
      'https://fftt.dafunker.com/v1/proxy/xml_result_equ.php?force=1&D1=234461&cx_poule=1502306',
    )
    expect(dafunkerResultsUrl('234461', '150a2306x')).toBe(
      'https://fftt.dafunker.com/v1/proxy/xml_result_equ.php?force=1&D1=234461&cx_poule=1502306',
    )
  })
})

describe('parseDafunkerResultsXml', () => {
  it('groups tours by poule number parsed from the libelle, sorted by pool then round', () => {
    const pools = parseDafunkerResultsXml(RESULTS_XML)
    expect(pools.map((p) => p.poolNumber)).toEqual([1, 2])
    expect(pools[0].matches.map((m) => m.round)).toEqual([1, 2])
  })

  it('parses team ids, names, numbers and club affiliation numbers from the CDATA link', () => {
    const pools = parseDafunkerResultsXml(RESULTS_XML)
    const match = pools[1].matches[0]
    expect(match).toEqual({
      id: '6491248',
      round: 1,
      date: '2026-09-20',
      home: {
        teamId: '1075',
        teamName: 'ETIVAL 4',
        teamNumber: 4,
        clubIdentifier: '06880123',
        clubName: '',
      },
      away: {
        teamId: '2017',
        // Collapses the double space from "ROSENAU+TT++2".
        teamName: 'ROSENAU TT 2',
        teamNumber: 2,
        clubIdentifier: '06680125',
        clubName: '',
      },
    })
  })

  it('prefers datereelle over dateprevue when they differ', () => {
    const pools = parseDafunkerResultsXml(RESULTS_XML)
    const rescheduled = pools[0].matches.find((m) => m.id === '6491028')
    expect(rescheduled?.date).toBe('2026-10-11')
  })

  it('returns an empty array for an empty <liste/> (unpublished calendar)', () => {
    expect(parseDafunkerResultsXml('<?xml version="1.0" encoding="ISO-8859-1"?><liste/>')).toEqual([])
  })

  it('returns an empty array on malformed XML', () => {
    expect(parseDafunkerResultsXml('not xml at all <<<')).toEqual([])
  })

  it('skips a tour with an unparseable libelle', () => {
    const xml = RESULTS_XML.replace('Poule 2 - tour n°1 du 20/09/2026', 'Journée annulée')
    const pools = parseDafunkerResultsXml(xml)
    expect(pools.map((p) => p.poolNumber)).toEqual([1])
  })
})

describe('dafunkerClubTeamsUrl', () => {
  it('builds the club-teams URL, sanitizing the affiliation number', () => {
    expect(dafunkerClubTeamsUrl('06680011')).toBe(
      'https://fftt.dafunker.com/v1/proxy/xml_equipe.php?force=1&numclu=06680011',
    )
    expect(dafunkerClubTeamsUrl('066/8001!1')).toBe(
      'https://fftt.dafunker.com/v1/proxy/xml_equipe.php?force=1&numclu=06680011',
    )
  })
})

describe('parseDafunkerClubTeamsXml', () => {
  it('resolves each team to its (D1, cx_poule, poule number)', () => {
    expect(parseDafunkerClubTeamsXml(CLUB_TEAMS_XML)).toEqual([
      { divisionId: '234142', cxPoule: '1502291', poolNumber: 3 },
      { divisionId: '234461', cxPoule: '1502306', poolNumber: 9 },
    ])
  })

  it('returns an empty array for an unknown club (empty <liste/>)', () => {
    expect(parseDafunkerClubTeamsXml('<?xml version="1.0" encoding="ISO-8859-1"?><liste/>')).toEqual([])
  })

  it('returns an empty array on malformed XML', () => {
    expect(parseDafunkerClubTeamsXml('not xml at all <<<')).toEqual([])
  })

  it('skips an equipe entry with no parseable division/cx_poule link', () => {
    const xml = CLUB_TEAMS_XML.replace(
      '<liendivision><![CDATA[cx_poule=1502291&D1=234142&organisme_pere=14]]></liendivision>',
      '<liendivision><![CDATA[]]></liendivision>',
    )
    expect(parseDafunkerClubTeamsXml(xml)).toEqual([{ divisionId: '234461', cxPoule: '1502306', poolNumber: 9 }])
  })
})
