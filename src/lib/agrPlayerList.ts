// Parser for an AGR club's player list (#648).
//
// Shared domain logic — no DOM, no network: fed the text lines that
// `extractPdfScheduleLines` reconstructs from the PDF's text layer.
//
// The AGR publishes a club's licensees as a PDF, « Liste des joueurs »:
//
//   LANDSER ASL
//   ( 680036 )
//   Numéro de licence NOM Prénom Classement actuel
//   351168 BROGLIN Nicolas 70
//   1525803 BÜCHI Christian 30
//   350952 SEGUY Jean pierre 80
//   Impression du 07 octobre 2026 - 06:19 GMT
//
// Each line is shaped as an FFTT licence record (`FfttLicence`) so the import
// review the FFTT built (#384, #566) serves it as it is: the number is the AGR
// licence, the « points » the AGR classement — lower is better (#646) —, and
// there is no category.
import { normalizePersonName, type FfttLicence } from './ffttPlayers'

export interface AgrPlayerList {
  /** « LANDSER ASL », as the AGR writes the club. */
  clubName: string
  /** « 680036 ». */
  affiliationNumber: string
  licences: FfttLicence[]
  /** Lines that looked like a licensee and could not be read: shown, never dropped. */
  unread: string[]
}

const HEADER_RE = /^Numéro de licence\s+NOM\s+Prénom\s+Classement/i
const AFFILIATION_RE = /^\(\s*(\d+)\s*\)$/
// « 1525803 BÜCHI Christian 30 »: the family name is the leading words in
// capitals, the first name the rest, then the classement.
const ROW_RE = /^(\d{4,9})\s+(.+?)\s+(\d{1,3})$/
const UPPER_WORD = /^[\p{Lu}][\p{Lu}'’-]*$/u
const FOOTER_RE = /^Impression du\b/i

/** Whether these lines are an AGR player list — before trying anything else on them. */
export function isAgrPlayerList(lines: readonly string[]): boolean {
  return lines.some((l) => HEADER_RE.test(l.trim()))
}

export function parseAgrPlayerListLines(rawLines: readonly string[]): AgrPlayerList | { error: string } {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const headerIndex = lines.findIndex((l) => HEADER_RE.test(l))
  if (headerIndex < 0) return { error: 'Ce document n’est pas une liste de joueurs de l’AGR.' }
  const before = lines.slice(0, headerIndex)
  const affiliationLine = before.findIndex((l) => AFFILIATION_RE.test(l))
  const affiliationNumber = affiliationLine >= 0 ? AFFILIATION_RE.exec(before[affiliationLine])![1] : ''
  const clubName = (affiliationLine > 0 ? before[affiliationLine - 1] : before[before.length - 1]) ?? ''

  const licences: FfttLicence[] = []
  const unread: string[] = []
  for (const line of lines.slice(headerIndex + 1)) {
    if (FOOTER_RE.test(line)) break
    const row = ROW_RE.exec(line)
    const words = row ? row[2].split(' ') : []
    const split = words.findIndex((w) => !UPPER_WORD.test(w))
    if (!row || split <= 0) { unread.push(line); continue }
    licences.push({
      licence: row[1],
      lastName: normalizePersonName(words.slice(0, split).join(' ')),
      firstName: normalizePersonName(words.slice(split).join(' ')),
      clubNumber: affiliationNumber,
      clubName,
      points: row[3],
      category: '',
    })
  }
  if (licences.length === 0) return { error: 'Aucun joueur lu dans cette liste.' }
  return { clubName, affiliationNumber, licences, unread }
}
