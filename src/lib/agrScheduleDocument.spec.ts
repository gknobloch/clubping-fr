import { describe, expect, it } from 'vitest'
import {
  isAgrScheduleDocument, parseAgrScheduleLines, poolLetterOf, poolNumberOfLetter, usualHomeSlot,
  type AgrScheduleDocument,
} from './agrScheduleDocument'
import { EXCELLENCE_A_PHASE_1, PROM_HONNEUR_A_PHASE_1, PROM_HONNEUR_A_PHASE_2 } from './__fixtures__/agrSchedules'

// #647 — three real AGR calendars, as the PDF text layer gives them.

const parse = (lines: string[]) => {
  const doc = parseAgrScheduleLines(lines)
  if ('error' in doc) throw new Error(doc.error)
  return doc as AgrScheduleDocument
}

describe('parseAgrScheduleLines', () => {
  it('reads the header: championship, division, poule, season and phase', () => {
    const doc = parse(PROM_HONNEUR_A_PHASE_1)
    expect(doc).toMatchObject({
      championship: 'Championnat MESSIEURS', division: 'Prom. HONNEUR', poolLetter: 'A', poolNumber: 1,
      sector: 'Secteur Départemental', seasonEndYear: 2027, phaseNumber: 1,
    })
  })

  it('reads seven journées of four matches, each with its own date and time', () => {
    const doc = parse(PROM_HONNEUR_A_PHASE_1)
    expect(doc.journees.map((j) => [j.number, j.matches.length])).toEqual(
      [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]],
    )
    expect(doc.journees[0].matches[1]).toEqual({
      date: '2026-09-23', time: '20h00',
      home: { club: 'ILLZACH ST JEAN BAPTISTE', number: 4 },
      away: { club: 'MOOSCH ST AUGUSTIN', number: 3 },
    })
    // « 20 h15 », and a hyphenated club.
    expect(doc.journees[0].matches[2]).toMatchObject({
      time: '20h15', home: { club: 'SPECHBACH MJC', number: 3 }, away: { club: 'KIRCHBERG-NIEDERBRUCK', number: 4 },
    })
    expect(doc.unread).toEqual([])
  })

  it('keeps a club’s two teams in one poule apart', () => {
    const doc = parse(PROM_HONNEUR_A_PHASE_1)
    expect(doc.journees[0].matches[3]).toMatchObject({
      home: { club: 'LUTTERBACH SG', number: 2 }, away: { club: 'LUTTERBACH SG', number: 4 },
    })
    expect(doc.clubs.filter((c) => c === 'LUTTERBACH SG')).toHaveLength(1)
  })

  it('keeps phase 2’s numbering as published — journées 8 to 14', () => {
    const doc = parse(PROM_HONNEUR_A_PHASE_2)
    expect(doc.phaseNumber).toBe(2)
    expect(doc.journees.map((j) => j.number)).toEqual([8, 9, 10, 11, 12, 13, 14])
    expect(doc.journees[0].matches[0]).toMatchObject({
      date: '2027-01-29', home: { club: 'LANDSER ASL', number: 2 }, away: { club: 'KEMBS ASL TT', number: 4 },
    })
  })

  it('keeps the footer as the poule’s notes, a wrapped line joined back, the AGR’s « + » dropped', () => {
    expect(parse(PROM_HONNEUR_A_PHASE_2).notes).toEqual([
      'KIRCHBERG/NIEDERBRUCK 4 JOUE A NIEDERBRUCK',
      'Les feuilles de match sont à envoyer dans les 48h à M Prénom NOM - 1, rue Exemple - 68000 VILLE (contact@example.invalid)',
      'LIMITE DES REPORTS DE MATCH : 30/04/2027',
    ])
    expect(parse(EXCELLENCE_A_PHASE_1).notes[0]).toBe('RIEDISHEIM 1 JOUE DANS LA SALLE DU MTT')
  })

  it('lists the clubs it names, eight in Excellence', () => {
    expect(parse(EXCELLENCE_A_PHASE_1).clubs).toEqual([
      'BALDERSHEIM ASTT', 'LANDSER ASL', 'ILLZACH ST JEAN BAPTISTE', 'RIEDISHEIM', 'INGERSHEIM ST ALOYSE',
      'MUNTZENHEIM TENNIS DE TABLE', 'WINTZFELDEN TT',
    ])
  })

  it('refuses what is not an AGR calendar', () => {
    expect(isAgrScheduleDocument(['CHAMPIONNAT GRAND EST ELITE Poule 3', '1ère phase 2026-2027'])).toBe(false)
    expect(isAgrScheduleDocument(PROM_HONNEUR_A_PHASE_1)).toBe(true)
    expect(parseAgrScheduleLines(['Bonjour'])).toEqual({ error: expect.any(String) })
  })

  it('shows a match line it cannot split rather than dropping it', () => {
    const lines = [...PROM_HONNEUR_A_PHASE_1]
    lines[5] = 'Ven 25-09-2026 20 h KEMBS ASL TT LANDSER ASL'
    expect(parse(lines).unread).toEqual(['Ven 25-09-2026 20 h KEMBS ASL TT LANDSER ASL'])
  })
})

describe('poules in letters', () => {
  it('stores a number and shows the letter', () => {
    expect(poolNumberOfLetter('a')).toBe(1)
    expect(poolNumberOfLetter('C')).toBe(3)
    expect(poolLetterOf(2)).toBe('B')
  })
})

describe('usualHomeSlot', () => {
  it('reads the day and time a team usually plays at home', () => {
    expect(usualHomeSlot(parse(PROM_HONNEUR_A_PHASE_1), 'LANDSER ASL', 2)).toEqual({ day: 'Vendredi', time: '20h00' })
    expect(usualHomeSlot(parse(PROM_HONNEUR_A_PHASE_1), 'ILLZACH ST JEAN BAPTISTE', 4)).toEqual({ day: 'Mercredi', time: '20h00' })
  })
})
