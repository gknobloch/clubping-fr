import { describe, expect, it } from 'vitest'
import { parseScheduleDocumentLines, type ParsedScheduleDocument } from './ffttScheduleDocument'

// Verbatim OCR output of a real Poule 22 PDF (#299), kept whole so the
// warning list can be asserted as empty. Two artefacts in it:
//   * "Journée S" — tesseract read the 5 as an S, which used to stop that line
//     being a header: its four fixtures appended to journée 4, which then held
//     two rounds and dated the strays inside the wrong week.
//   * "RIXHEIM PPA 4 _ contre" / "__ contre" — stray underscores.
const OCR = `CHAMPIONNAT GRAND EST 5 Poule 22
1ère phase 2026-2027
1 WILLER SUR THUR 1 Mercredi 20h 06680143
2 RIXHEIM PPA 4 Jeudi 19h30 06680011
3 KEMBS TT 2 Mardi 20h15 06680140
4 OSTHEIM CPPC 1 Lundi 20h 06680020
5 SOULTZ CSM TT 2 Lundi 20h 06680138
6 MULHOUSE FC 1 Jeudi 20h 06680006
7 MULHOUSE TT 6 Vendredi 20h 06680105
8 ROSENAU TT 5 Jeudi 20h 06680125
Journée 1 : du 14 au 20 septembre 2026
Mercredi 20h WILLER SUR THUR 1 contre ROSENAU TT 5 -
Jeudi 19h30 RIXHEIM PPA 4 _ contre MULHOUSE TT 6 -
Mardi 20h15 KEMBS TT 2 contre MULHOUSE FC 1 -
Lundi 20h OSTHEIM CPPC 1 contre SOULTZ CSM TT 2 -
Journée 2 : du 28 sept au 04 octobre 2026
Vendredi 20h MULHOUSE TT 6 contre WILLER SUR THUR 1 -
Jeudi 20h MULHOUSE FC 1 contre RIXHEIM PPA 4 -
Lundi 20h SOULTZ CSM TT 2 contre KEMBS TT 2 -
Jeudi 20h ROSENAU TT 5 contre OSTHEIM CPPC 1 -
Journée 3 : du 12 au 18 octobre 2026
Mercredi 20h WILLER SUR THUR 1 contre MULHOUSE FC 1 -
Jeudi 19h30 RIXHEIM PPA 4 _ contre SOULTZ CSM TT 2 -
Mardi 20h15 KEMBS TT 2 contre OSTHEIM CPPC 1 -
Jeudi 20h ROSENAU TT 5 contre MULHOUSE TT 6 -
Journée 4 : du 02 au 08 novembre 2026
Lundi 20h SOULTZ CSM TT 2 contre WILLER SUR THUR 1 -
Lundi 20h OSTHEIM CPPC 1 contre RIXHEIM PPA 4 -
Mardi 20h15 KEMBS TT 2 contre ROSENAU TT 5 -
Jeudi 20h MULHOUSE FC 1 contre MULHOUSE TT 6 -
Journée S : du 16 au 22 novembre 2026
Mercredi 20h WILLER SUR THUR 1 contre OSTHEIM CPPC 1 -
Jeudi 19h30 RIXHEIM PPA 4 _ contre KEMBS TT 2 -
Vendredi 20h MULHOUSE TT 6 contre SOULTZ CSM TT 2 -
Jeudi 20h ROSENAU TT 5 contre MULHOUSE FC 1 -
Journée 6 : du 30 nov au 06 décembre 2026
Mardi 20h15 KEMBS TT 2 contre WILLER SUR THUR 1 -
Jeudi 19h30 RIXHEIM PPA 4 __ contre ROSENAU TT 5 -
Lundi 20h OSTHEIM CPPC 1 contre MULHOUSE TT 6 -
Lundi 20h SOULTZ CSM TT 2 contre MULHOUSE FC 1 -
Journée 7 : du 07 au 13 décembre 2026
Mercredi 20h WILLER SUR THUR 1 contre RIXHEIM PPA 4 -
Vendredi 20h MULHOUSE TT 6 contre KEMBS TT 2 -
Jeudi 20h MULHOUSE FC 1 contre OSTHEIM CPPC 1 -
Jeudi 20h ROSENAU TT 5 contre SOULTZ CSM TT 2 -
Edition du 15/07/2026`

const parse = () => parseScheduleDocumentLines(OCR.split('\n')) as ParsedScheduleDocument

describe('OCR artefacts in a real Poule 22 document (#299)', () => {
  it('reads "Journée S" as journée 5 instead of losing the header', () => {
    expect(parse().journees.map((j) => j.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps every round to its own four fixtures', () => {
    expect(parse().journees.map((j) => j.matches.length)).toEqual([4, 4, 4, 4, 4, 4, 4])
  })

  it('dates journée 5 inside its own week, not journée 4’s', () => {
    const j5 = parse().journees.find((j) => j.number === 5)!
    // Rixheim plays Thursday; J5 runs 16–22 Nov, so 19 Nov — not 5 Nov, which
    // is the Thursday of journée 4's week and what the merge produced.
    expect(j5.matches.find((m) => m.homeName.includes('RIXHEIM'))!.date).toBe('2026-11-19')
  })

  it('parses clean: no merge, no gap, and no noise about the template footer', () => {
    expect(parse().warnings).toEqual([])
  })
})
