import { describe, expect, it } from 'vitest'
import { parseScheduleDocumentLines, splitScheduleDocumentSections } from './ffttScheduleDocument'

// Lines transcribed from the real "GE 7 phase 1" export, which holds poules 42
// to 45 — one page each, in a single PDF (#486). Two of its pages are enough
// to pin the seam down, trailing template noise included: the points column
// ("0" once per team) and the "joue toujours à domicile" note the export adds
// for a club that hosts every round.
const GE7_TWO_POULES = [
  'CHAMPIONNAT GRAND EST 7 Poule 42',
  '1ère phase 2026-2027',
  '1 WITTELSHEIM MDPA TT 4 Jeudi 20h 06680118',
  '2 HORBOURG-WIHR TT 1 Mardi 20h 06680059',
  '3 THANN TTC 4 Samedi 16h 06680111',
  '4 RIXHEIM PPA 7 Jeudi 20h 06680011',
  'Journée 1 : du 14 au 20 septembre 2026',
  'Jeudi 20h WITTELSHEIM MDPA TT 4 contre RIXHEIM PPA 7 -',
  'Mardi 20h HORBOURG-WIHR TT 1 contre THANN TTC 4 -',
  '0',
  '0',
  'Edition du 04/09/2026',
  'CHAMPIONNAT GRAND EST 7 Poule 43',
  '1ère phase 2026-2027',
  '1 ENSISHEIM TTMC 1 Samedi 13h30 06680123',
  '2 ILLZACH TTSJB 10 Mercredi 20h 06680091',
  '3 KEMBS TT 4 Mardi 20h15 06680140',
  '4 RIXHEIM PPA 6 Jeudi 20h 06680011',
  'Journée 1 : du 14 au 20 septembre 2026',
  'Samedi 13h30 ENSISHEIM TTMC 1 contre RIXHEIM PPA 6 -',
  'Mercredi 20h ILLZACH TTSJB 10 contre KEMBS TT 4 -',
  'Ensisheim TTMC 1 joue toujours à domicile',
  '0',
  'Edition du 04/09/2026',
]

describe('splitScheduleDocumentSections', () => {
  it('cuts a multi-poule export into one section per poule', () => {
    const sections = splitScheduleDocumentSections(GE7_TWO_POULES)

    expect(sections).toHaveLength(2)
    expect(sections[0][0]).toBe('CHAMPIONNAT GRAND EST 7 Poule 42')
    expect(sections[1][0]).toBe('CHAMPIONNAT GRAND EST 7 Poule 43')
    // The seam is the header, so each page's own footer stays on its page.
    expect(sections[0][sections[0].length - 1]).toBe('Edition du 04/09/2026')
  })

  it('parses each section as its own calendar', () => {
    const parsed = splitScheduleDocumentSections(GE7_TWO_POULES).map(parseScheduleDocumentLines)

    const poolNumbers = parsed.map((p) => ('error' in p ? null : p.poolNumber))
    expect(poolNumbers).toEqual([42, 43])
    for (const p of parsed) {
      if ('error' in p) throw new Error(`expected a parsed document, got error: ${p.error}`)
      // Each poule keeps its own roster and its own single journée — parsed
      // whole, the file read as one poule with two journées 1, the roster of
      // its first page only, and every line of the second page unreadable.
      expect(p.teams).toHaveLength(4)
      expect(p.journees.map((j) => j.number)).toEqual([1])
      expect(p.journees[0].matches).toHaveLength(2)
      expect(p.errors).toEqual([])
      // Nothing to warn about: the points column and the "joue toujours à
      // domicile" note are template furniture, not unreadable match rows.
      expect(p.warnings).toEqual([])
    }
  })

  it('returns a single section for a one-poule document, unchanged', () => {
    const single = GE7_TWO_POULES.slice(0, 12)
    expect(splitScheduleDocumentSections(single)).toHaveLength(1)
  })

  it('never splits on a poule number inside a roster or match row', () => {
    // A club actually named after its poule is far-fetched; a photographed
    // document whose match row picks up the word from the line above is not.
    const sections = splitScheduleDocumentSections([
      ...GE7_TWO_POULES.slice(0, 9),
      'Samedi 16h POULE 3 TT 1 contre THANN TTC 4 -',
      '5 POULE 3 TT 1 Samedi 16h 06680222',
    ])
    expect(sections).toHaveLength(1)
  })

  it('keeps anything before the first header with it', () => {
    const sections = splitScheduleDocumentSections(['F.F.T.T.', '', ...GE7_TWO_POULES.slice(0, 9)])
    expect(sections).toHaveLength(1)
    expect(sections[0][0]).toBe('F.F.T.T.')
    const parsed = parseScheduleDocumentLines(sections[0])
    if ('error' in parsed) throw new Error('expected the header to still be found')
    expect(parsed.poolNumber).toBe(42)
  })

  it('yields one empty section when nothing was extracted', () => {
    expect(splitScheduleDocumentSections([])).toEqual([[]])
    expect(parseScheduleDocumentLines([])).toEqual({ error: 'header_not_found' })
  })
})
