import { describe, expect, it } from 'vitest'
import { AFFILIATION_NUMBER_RE, divisionLabelScore, parseScheduleDocumentLines } from './ffttScheduleDocument'

// Lines transcribed from a real FFTT poule export (Elite Poule 3, 2026/2027,
// journées with a single fixed Saturday date).
const ELITE_POULE_3_LINES = [
  'CHAMPIONNAT GRAND EST ELITE Poule 3',
  '1ère phase 2026-2027',
  '1 THAON CHENIMENIL ESTT 1 Samedi 16h 06880145',
  '2 ILLZACH TTSJB 2 Samedi 16h 06680091',
  '3 TROYES OS-NOES 1 Samedi 16h 06100002',
  '4 ANOULD CP 2 Samedi 16h 06880002',
  '5 BERGHEIM CSS 1 Samedi 16h 06680128',
  '6 COLMAR MJC 1 Samedi 16h 06680004',
  '7 RIXHEIM PPA 1 Samedi 16h 06680011',
  '8 ROSENAU TT 1 Samedi 16h 06680125',
  '',
  'Journée 1 : 19 septembre 2026',
  'Samedi 16h THAON CHENIMENIL ESTT 1 contre ROSENAU TT 1 -',
  'Samedi 16h ILLZACH TTSJB 2 contre RIXHEIM PPA 1 -',
  'Samedi 16h TROYES OS-NOES 1 contre COLMAR MJC 1 -',
  'Samedi 16h ANOULD CP 2 contre BERGHEIM CSS 1 -',
  '',
  'Journée 2 : 03 octobre 2026',
  'Samedi 16h RIXHEIM PPA 1 contre THAON CHENIMENIL ESTT 1 -',
  'Samedi 16h COLMAR MJC 1 contre ILLZACH TTSJB 2 -',
  'Samedi 16h BERGHEIM CSS 1 contre TROYES OS-NOES 1 -',
  'Samedi 16h ROSENAU TT 1 contre ANOULD CP 2 -',
]

// Lines transcribed from a GE3 poule export: date-range journées, one
// same-month ("du 14 au 20 septembre 2026") and one cross-month with an
// abbreviated start month ("du 28 sept au 04 octobre 2026").
const GE3_POULE_12_LINES = [
  'CHAMPIONNAT GRAND EST 3 Poule 12',
  '1ère phase 2026-2027',
  '1 BOOTZHEIM FCJ 2 Samedi 15h 06670183',
  '2 THANN TTC 1 Dimanche 9h30 06680111',
  '3 BARR TT 4 Samedi 16h 06670221',
  '4 ROSENAU TT 3 Samedi 16h 06680125',
  '',
  'Journée 1 : du 14 au 20 septembre 2026',
  'Samedi 15h BOOTZHEIM FCJ 2 contre OBERNAI CA 2 -',
  '',
  'Journée 2 : du 28 sept au 04 octobre 2026',
  'Samedi 16h RIXHEIM PPA 3 contre BOOTZHEIM FCJ 2 -',
  '',
  'Journée 4 : du 02 au 08 novembre 2026',
  'Samedi 16h WITTELSHEIM MDPA TT 1 contre BOOTZHEIM FCJ 2 -',
]

describe('parseScheduleDocumentLines', () => {
  it('parses the header, roster and fixed-date journées', () => {
    const result = parseScheduleDocumentLines(ELITE_POULE_3_LINES)
    if ('error' in result) throw new Error(`expected a parsed document, got error: ${result.error}`)

    expect(result.divisionLabel).toBe('CHAMPIONNAT GRAND EST ELITE')
    expect(result.poolNumber).toBe(3)
    expect(result.phaseNumber).toBe(1)
    expect(result.seasonLabel).toBe('2026-2027')
    expect(result.seasonId).toBe('27')
    expect(result.warnings).toEqual([])

    expect(result.teams).toHaveLength(8)
    expect(result.teams[0]).toEqual({
      rank: 1, name: 'THAON CHENIMENIL ESTT', number: 1, day: 'Samedi', time: '16h00',
      affiliationNumber: '06880145', affiliationValid: true,
    })
    expect(result.teams[6]).toMatchObject({ name: 'RIXHEIM PPA', number: 1, affiliationNumber: '06680011' })

    expect(result.journees).toHaveLength(2)
    const [j1, j2] = result.journees
    expect(j1).toMatchObject({ number: 1, dateType: 'fixed', date: '2026-09-19', rangeEndDate: null })
    expect(j1.matches).toHaveLength(4)
    expect(j1.matches[0]).toEqual({
      day: 'Samedi', time: '16h00',
      homeName: 'THAON CHENIMENIL ESTT', homeNumber: 1,
      awayName: 'ROSENAU TT', awayNumber: 1,
      score: '-',
    })
    expect(j2).toMatchObject({ number: 2, date: '2026-10-03' })
  })

  it('parses same-month and cross-month date-range journées', () => {
    const result = parseScheduleDocumentLines(GE3_POULE_12_LINES)
    if ('error' in result) throw new Error(`expected a parsed document, got error: ${result.error}`)

    expect(result.divisionLabel).toBe('CHAMPIONNAT GRAND EST 3')
    expect(result.poolNumber).toBe(12)
    expect(result.journees).toHaveLength(3)

    const [j1, j2, j4] = result.journees
    expect(j1).toMatchObject({ dateType: 'range', date: '2026-09-14', rangeEndDate: '2026-09-20' })
    // Abbreviated start month ("sept"), cross-month range: the start date's
    // year/month must come from the end date's month, not just its year.
    expect(j2).toMatchObject({ dateType: 'range', date: '2026-09-28', rangeEndDate: '2026-10-04' })
    expect(j4).toMatchObject({ number: 4, dateType: 'range', date: '2026-11-02', rangeEndDate: '2026-11-08' })
  })

  it('flags a malformed affiliation number instead of silently trusting it', () => {
    const lines = [...ELITE_POULE_3_LINES]
    const idx = lines.indexOf('1 THAON CHENIMENIL ESTT 1 Samedi 16h 06880145')
    lines[idx] = '1 THAON CHENIMENIL ESTT 1 Samedi 16h O688O145' // OCR confusing O/0
    const result = parseScheduleDocumentLines(lines)
    if ('error' in result) throw new Error(`expected a parsed document, got error: ${result.error}`)
    expect(result.teams[0].affiliationValid).toBe(false)
    expect(result.teams[0].affiliationNumber).toBe('O688O145')
  })

  it('reports an error when no "Poule N" header can be located', () => {
    const result = parseScheduleDocumentLines(['some unrelated text', 'more text'])
    expect(result).toEqual({ error: 'header_not_found' })
  })

  it('warns instead of failing when journées are missing entirely', () => {
    const result = parseScheduleDocumentLines(['CHAMPIONNAT GRAND EST ELITE Poule 3', '1ère phase 2026-2027'])
    if ('error' in result) throw new Error('expected a parsed document')
    expect(result.journees).toEqual([])
    expect(result.warnings).toContain('Aucune journée détectée dans le document.')
  })

  it('warns on an unreadable match line inside a journée instead of dropping the whole document', () => {
    const lines = [...ELITE_POULE_3_LINES, 'Ligne de match complètement corrompue']
    const result = parseScheduleDocumentLines(lines)
    if ('error' in result) throw new Error('expected a parsed document')
    expect(result.warnings.some((w) => w.includes('Ligne de match illisible'))).toBe(true)
  })
})

describe('AFFILIATION_NUMBER_RE', () => {
  it('accepts exactly 8 digits', () => {
    expect(AFFILIATION_NUMBER_RE.test('06680011')).toBe(true)
    expect(AFFILIATION_NUMBER_RE.test('0668001')).toBe(false)
    expect(AFFILIATION_NUMBER_RE.test('066800111')).toBe(false)
    expect(AFFILIATION_NUMBER_RE.test('O6680011')).toBe(false)
  })
})

describe('divisionLabelScore', () => {
  it('scores higher for a closer label match', () => {
    const close = divisionLabelScore('CHAMPIONNAT GRAND EST 3', 'Grand Est 3 Phase 1')
    const far = divisionLabelScore('CHAMPIONNAT GRAND EST 3', 'Régionale 1 Phase 2')
    expect(close).toBeGreaterThan(far)
  })

  it('returns 0 for an empty label or display name', () => {
    expect(divisionLabelScore('', 'Grand Est 3 Phase 1')).toBe(0)
    expect(divisionLabelScore('CHAMPIONNAT GRAND EST 3', '')).toBe(0)
  })
})
