// FFTT names, spelled for people (#474). Shared by the web app (@/lib/ffttNames)
// and the mobile app (@shared/lib/ffttNames), which is why it lives apart from
// ffttClub.ts: that module parses XML with the browser's DOMParser, and the app
// has none. Keep this one free of any browser/RN/Node deps.

/**
 * Words a short all-caps token can be, other than a club-type abbreviation
 * (#474).
 *
 * The rule underneath is that FFTT writes club names in capitals, so a token
 * of four letters or fewer is assumed to be an initialism — "TT", "PPA",
 * "CSS", "CPPC" — and left shouting. That is right often enough to keep, and
 * wrong for every short French word that shows up in a commune's name: it
 * turned "MULHOUSE TENNIS DE TABLE" into "Mulhouse Tennis DE Table".
 *
 * The list below was drawn from the ~530 real club names FFTT publishes for
 * eight departments, taking the short tokens that were plainly words rather
 * than initials. It cannot be complete — French place names are unbounded, so
 * "AIX", "FOS" and "NORT" still come out capitalised — but it covers the joints
 * that recur in almost every name.
 */
export const SHORT_WORDS = new Set([
  // Articles and prepositions, the joints of a commune's name.
  'de', 'du', 'des', 'd', 'au', 'aux', 'en', 'et', 'sur', 'sous', 'lès', 'lez',
  'la', 'le', 'les', 'l',
  // What a club calls itself.
  'club', 'ping', 'pong', 'jeu', 'jeux', 'sport', 'plus', 'loisir',
  // What a place is made of.
  'val', 'vals', 'mont', 'pont', 'bois', 'lac', 'eau', 'eaux', 'ile', 'pré',
  'parc', 'rive', 'port', 'fort', 'tour', 'bord', 'baie', 'cap', 'roc', 'puy',
  'mer', 'lys', 'chef', 'haie', 'pas', 'fosse',
  'nord', 'sud', 'est', 'ouest', 'bas', 'haut', 'neuf', 'vieux', 'gros',
  'petit', 'grand', 'vieil',
  // Saints, who name a great many French communes.
  'st', 'ste', 'jean', 'paul', 'marc', 'luc', 'remy', 'leon', 'rene', 'yves',
  'anne', 'roch', 'cyr', 'loup', 'just', 'omer', 'ouen',
  'pere', 'père', 'mere', 'mère', 'dame', 'fils',
  // Towns short enough to be mistaken for initials.
  'lyon', 'aix', 'metz', 'caen', 'nice', 'pau', 'sete', 'agde', 'albi', 'dax',
  'lens', 'laon', 'sens', 'gap', 'foix', 'riom', 'vire', 'reze',
])

/**
 * Of those, the ones that stay lowercase *between* two other words:
 * "Willer sur Thur", "Mulhouse Tennis de Table", "Flines lez Raches".
 *
 * Prepositions only — never the articles. "LA" is as often part of the name
 * itself ("ASL La Robertsau", "La Teste") as it is a joint inside it
 * ("Beuvry-la-Forêt"), and the two cannot be told apart without a list of every
 * commune in France. Capitalising it is wrong in some names and right in
 * others; lowercasing a preposition is right in nearly all of them.
 *
 * At either end of the name they keep their capital, because there they are
 * what the club is called rather than a joint: "Le Monde du Pingpong".
 */
export const LOWERCASE_PARTICLES = new Set([
  'de', 'du', 'des', 'd', 'au', 'aux', 'en', 'et', 'sur', 'sous', 'lès', 'lez',
])

export const lower = (s: string) => s.toLocaleLowerCase('fr-FR')
export const title = (s: string) => s.charAt(0).toLocaleUpperCase('fr-FR') + lower(s.slice(1))

/** Runs of letters; everything between them is punctuation to be left alone. */
const LETTER_RUNS = /\p{L}+/gu

/** Exactly an apostrophe between two letter runs — an elision, not a break. */
const APOSTROPHE = /^['’]$/

/**
 * FFTT club and city names come back in ALL CAPS. Title-case each word so it
 * reads normally ("BERGHEIM" → "Bergheim"), leaving short tokens alone as the
 * abbreviations they usually are ("TT", "PPA", "CSS", "CPPC") unless they are
 * in SHORT_WORDS, and lowercasing the prepositions that join a name together.
 *
 * Everything that is not a letter — hyphens, apostrophes, dots, parentheses,
 * digits — is glue, preserved exactly where it was. That is what keeps
 * "SAINT-LOUIS" hyphenated, elides "VILLENEUVE D'ASCQ" to "Villeneuve d'Ascq",
 * spares the dotted initialisms FFTT is fond of ("A.S.C.", "N.A.C.T.T."), and
 * handles the inverted article it writes as "BERNERIE (LA)" → "Bernerie (La)".
 *
 * Position is counted over letter runs only, so a name reads the same whether
 * FFTT spaced or hyphenated it: "AIX LES MILLES" and "BOURG-LÈS-VALENCE" put
 * their particle in the middle either way.
 */
export function normalizeFfttName(raw: string): string {
  const runs = [...raw.matchAll(LETTER_RUNS)]
  if (runs.length === 0) return raw

  let out = ''
  let at = 0
  runs.forEach((match, i) => {
    const word = match[0]
    const key = lower(word)
    // First and last carry the club's own name; only what sits between them is
    // a joint (#474).
    const interior = i > 0 && i < runs.length - 1
    // Glue this run to the previous one: an apostrophe and nothing else.
    const glue = raw.slice(at, match.index)

    out += glue
    if (interior && LOWERCASE_PARTICLES.has(key)) out += key
    // Straight after an apostrophe the run finishes a word someone elided —
    // "d'ASCQ" is Ascq, "VALENC'IN" is one name — so it is never an
    // abbreviation, however short it is.
    else if (APOSTROPHE.test(glue)) out += title(word)
    else if (word.length <= 4 && !SHORT_WORDS.has(key)) out += word
    else out += title(word)
    at = match.index + word.length
  })
  return out + raw.slice(at)
}
