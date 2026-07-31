import { describe, expect, it } from 'vitest'
import { parseScheduleDocumentLines } from '@/lib/ffttScheduleDocument'

const head = `CHAMPIONNAT GRAND EST 5 Poule 22
1ère phase 2026-2027
1 WILLER SUR THUR 1 Mercredi 20h 06680143
2 RIXHEIM PPA 4 Jeudi 19h30 06680011
3 KEMBS TT 2 Mardi 20h15 06680140
4 OSTHEIM CPPC 1 Lundi 20h 06680020`

// J5's header dropped, exactly as the real Poule 22 extraction did.
const missingHeader = `${head}
Journée 4 : du 02 au 08 novembre 2026
Lundi 20h OSTHEIM CPPC 1 contre RIXHEIM PPA 4 -
Mardi 20h15 KEMBS TT 2 contre WILLER SUR THUR 1 -
Mercredi 20h WILLER SUR THUR 1 contre OSTHEIM CPPC 1 -
Jeudi 19h30 RIXHEIM PPA 4 contre KEMBS TT 2 -`

describe('journée sanity checks', () => {
  it('warns when a lost header merges two rounds into one', () => {
    const r = parseScheduleDocumentLines(missingHeader.split('\n')) as { warnings: string[] }
    expect(r.warnings.join(' ')).toMatch(/Journée 4 : 4 équipe\(s\) y jouent plusieurs fois/)
  })

  it('warns about a gap in the journée numbering', () => {
    const gapped = `${head}
Journée 1 : du 14 au 20 septembre 2026
Lundi 20h OSTHEIM CPPC 1 contre RIXHEIM PPA 4 -
Journée 3 : du 12 au 18 octobre 2026
Lundi 20h OSTHEIM CPPC 1 contre RIXHEIM PPA 4 -`
    const r = parseScheduleDocumentLines(gapped.split('\n')) as { warnings: string[] }
    expect(r.warnings.join(' ')).toMatch(/Journée 2 absente/)
  })

  it('stays quiet on a well-formed document', () => {
    const ok = `${head}
Journée 1 : du 14 au 20 septembre 2026
Lundi 20h OSTHEIM CPPC 1 contre RIXHEIM PPA 4 -
Mardi 20h15 KEMBS TT 2 contre WILLER SUR THUR 1 -
Journée 2 : du 28 sept au 04 octobre 2026
Mercredi 20h WILLER SUR THUR 1 contre OSTHEIM CPPC 1 -
Jeudi 19h30 RIXHEIM PPA 4 contre KEMBS TT 2 -`
    const r = parseScheduleDocumentLines(ok.split('\n')) as { warnings: string[] }
    expect(r.warnings).toEqual([])
  })
})
