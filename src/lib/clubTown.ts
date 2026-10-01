// Shared domain logic — imported by the web app (@/lib/clubTown) and the mobile
// app (@shared/lib/clubTown). Keep this module free of any browser/RN/Node deps.
import { LOWERCASE_PARTICLES, lower, normalizeFfttName, title } from './ffttNames'

/**
 * Words that say what a club is rather than where. Compared lowercased, and
 * only as whole words: « Tennis de Table » goes, « Tennis-sur-Mer » would not.
 */
const CLUB_WORDS = new Set([
  'tennis', 'table', 'club', 'ping', 'pong', 'pingpong', 'pongiste', 'pongistes',
  'tt', 'ttc', 'asptt', 'association', 'amicale', 'union', 'entente', 'sportive', 'sportif',
  'sporting', 'omnisports', 'cercle', 'foyer', 'loisir', 'loisirs', 'sport', 'sports',
  'section', 'culture', 'jeunesse', 'olympique', 'racing',
])

/** What may be left dangling at either end once the club words are gone. */
const JOINTS = new Set([...LOWERCASE_PARTICLES, 'la', 'le', 'les', 'l'])

/**
 * The town a club's name carries, for a club with no address on file (#611).
 *
 * An FFTT name is a town and what the club calls itself, in either order —
 * « RIXHEIM PPA », « CSS BERGHEIM », « MULHOUSE TENNIS DE TABLE », « SPICHEREN
 * C.S.N » — so what is left once the abbreviations and the club words go is
 * the town. Normalising first (`normalizeFfttName`) is what tells the two
 * apart: an abbreviation stays in capitals, a word does not.
 *
 * Except that a short word of a town's own stays in capitals too — « Willer
 * sur THUR », « NORT sur Erdre » — so a capitalised token beside a joint
 * (« sur », « en », « de »…) is kept, as part of the town it is joined to.
 *
 * A guess, and said to be one wherever it is shown: it is only reached when a
 * club has no address at all, which the FFTT fill of #613 makes rare. Returns
 * `undefined` when nothing plausible is left, rather than a stray word.
 */
export function townFromClubName(name: string): string | undefined {
  const tokens = normalizeFfttName(name.trim()).split(/\s+/).filter(Boolean)
  const isJoint = (t: string | undefined) => !!t && LOWERCASE_PARTICLES.has(t)

  const kept: string[] = []
  tokens.forEach((token, i) => {
    const letters = token.replace(/[^\p{L}]/gu, '')
    if (!letters) return // a team number, « 13 », « (5) »
    if (token.includes('.')) return // « C.S.N », « A.S.C. », « T.T. »
    if (CLUB_WORDS.has(lower(letters))) return
    const shouting = letters.length >= 2 && letters === letters.toLocaleUpperCase('fr-FR')
    if (shouting) {
      if (isJoint(tokens[i - 1]) || isJoint(tokens[i + 1])) kept.push(title(token))
      return // « PPA », « CSS », « EMTT »
    }
    kept.push(token)
  })

  while (kept.length && JOINTS.has(lower(kept[0]))) kept.shift()
  while (kept.length && JOINTS.has(lower(kept[kept.length - 1]))) kept.pop()
  const town = kept.join(' ')
  // Capitalised again: a leading joint that survived is part of the name now.
  return town.length >= 2 ? town.charAt(0).toLocaleUpperCase('fr-FR') + town.slice(1) : undefined
}
