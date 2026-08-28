// FFTT club detail import (#247), browser-side like the other FFTT imports
// (#229/#231): FFTT/dafunker block Cloudflare's egress IPs, so this is fetched
// from the browser and handed to the app's own club-creation flow (`addClub`)
// — a single club has no cross-entity linking to validate server-side, unlike
// divisions/teams/games, so there's no dedicated preview/import API endpoint.
//
// Source: GET https://fftt.dafunker.com/v1/proxy/xml_club_detail.php?club=<affiliationNumber>
//   <liste><club><numero/><nom/><nomsalle/><adressesalle1/><adressesalle2/>
//   <adressesalle3/><codepsalle/><villesalle/>
//   <nomcor/><prenomcor/><mailcor/><telcor/>...</club></liste>
// The `*cor` fields are the club's official correspondent (#474) — one per
// club, since they are scalar rather than a repeating element.
// An unknown club number returns a <liste> with no <club> child.

const FFTT_CLUB_DETAIL_URL = 'https://fftt.dafunker.com/v1/proxy/xml_club_detail.php'
const TIMEOUT_MS = 15000

/**
 * The official contact FFTT publishes for a club (#474).
 *
 * The schema holds exactly one — `nomcor`/`prenomcor`/`mailcor`/`telcor` are
 * scalar fields, not a repeating element — so a club has a correspondent or it
 * has none. Any of the four may be empty even when the others are filled.
 *
 * This is evidence, not a credential. It says who the federation lists as the
 * club's contact, which is what a general admin weighs a request against; the
 * application never writes to this address (#474).
 */
export interface FfttCorrespondent {
  /** Family name, normalized ("COLLE" → "Colle"); empty when FFTT states none. */
  lastName: string
  firstName: string
  /** As FFTT publishes it, case included — it is compared, not sent to. */
  email: string
  phone: string
}

/** A parsed club detail: identity, its single game venue, and its contact. */
export interface FfttClubDetail {
  affiliationNumber: string
  displayName: string
  venueLabel: string
  street: string
  postalCode: string
  city: string
  /** Absent when FFTT publishes no contact at all for this club (#474). */
  correspondent?: FfttCorrespondent
}

function text(node: ParentNode, tag: string): string {
  return node.querySelector(tag)?.textContent?.trim() ?? ''
}

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
const SHORT_WORDS = new Set([
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
const LOWERCASE_PARTICLES = new Set([
  'de', 'du', 'des', 'd', 'au', 'aux', 'en', 'et', 'sur', 'sous', 'lès', 'lez',
])

const lower = (s: string) => s.toLocaleLowerCase('fr-FR')
const title = (s: string) => s.charAt(0).toLocaleUpperCase('fr-FR') + lower(s.slice(1))

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

// ---------------------------------------------------------------------------
// Import preview (#280)
// ---------------------------------------------------------------------------

/** One reviewable field of an FFTT club import. */
export interface ClubSyncField {
  key: 'displayName' | 'venue'
  label: string
  /** What the club has today; null when it has nothing (e.g. a new club, or no venue yet). */
  current: string | null
  /** What the FFTT payload would set; null when FFTT has nothing to offer. */
  incoming: string | null
  /** Same on both sides — there is nothing to decide, so it is not selectable. */
  unchanged: boolean
  /** Nothing usable coming from FFTT, so this field cannot be imported at all. */
  unavailable: boolean
}

/** One line of address, as shown in the preview and stored on the club. */
export interface ClubVenue {
  label: string
  street: string
  postalCode: string
  city: string
}

/** Human-readable single line for a venue, or null when it is entirely empty. */
export function formatVenue(v: ClubVenue | null | undefined): string | null {
  if (!v) return null
  const street = [v.street, [v.postalCode, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const line = [v.label, street].filter(Boolean).join(' · ')
  return line || null
}

/**
 * Build the reviewable field list for an FFTT club import (#280).
 *
 * `current` is the club as it stands — omit it for a club being created, which
 * simply leaves every `current` null. A field is only selectable when FFTT has
 * something to offer AND it differs from what is already there: importing a
 * value identical to the current one is a no-op, and importing nothing would
 * erase data the FFTT payload never had.
 */
export function clubSyncFields(
  incoming: Pick<FfttClubDetail, 'displayName' | 'venueLabel' | 'street' | 'postalCode' | 'city'>,
  current?: { displayName: string; venue: ClubVenue | null },
): ClubSyncField[] {
  const incomingVenue: ClubVenue = {
    label: incoming.venueLabel || 'Salle',
    street: incoming.street,
    postalCode: incoming.postalCode,
    city: incoming.city,
  }
  // The label alone is a default we invented, not information from FFTT.
  const hasVenue = hasVenueInfo(incoming)

  const name: ClubSyncField = {
    key: 'displayName',
    label: 'Nom du club',
    current: current?.displayName ?? null,
    incoming: incoming.displayName || null,
    unchanged: !!current && current.displayName === incoming.displayName,
    unavailable: !incoming.displayName,
  }

  const currentVenueLine = formatVenue(current?.venue)
  const incomingVenueLine = hasVenue ? formatVenue(incomingVenue) : null
  const venue: ClubSyncField = {
    key: 'venue',
    label: 'Lieu de jeu',
    current: currentVenueLine,
    incoming: incomingVenueLine,
    unchanged: !!currentVenueLine && currentVenueLine === incomingVenueLine,
    unavailable: !incomingVenueLine,
  }

  return [name, venue]
}

/** The fields a preview should start with ticked: everything actually importable. */
export function defaultSelectedFields(fields: ClubSyncField[]): Set<ClubSyncField['key']> {
  return new Set(fields.filter((f) => !f.unchanged && !f.unavailable).map((f) => f.key))
}

// clubIdFromAffiliation used to live here. It moved to entityIds.ts in #285 so
// the API can derive a club id without this module's DOMParser following it
// into a worker. Its rationale (#275) travelled with it.

/** Whether a club detail carries any usable game-venue information at all. */
export function hasVenueInfo(d: Pick<FfttClubDetail, 'street' | 'postalCode' | 'city'>): boolean {
  return Boolean(d.street || d.postalCode || d.city)
}

/**
 * Parse an xml_club_detail.php response. Returns null when the XML is
 * malformed or carries no `<club>` (unknown affiliation number). `venueLabel`
 * is returned raw (possibly empty) — callers decide whether to default it
 * ("Salle") or skip the address entirely when there's no venue info at all.
 */
export function parseClubDetailXml(xml: string): FfttClubDetail | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return null
  const club = doc.querySelector('club')
  if (!club) return null

  const affiliationNumber = text(club, 'numero')
  const rawName = text(club, 'nom')
  if (!affiliationNumber || !rawName) return null

  const street = [text(club, 'adressesalle1'), text(club, 'adressesalle2'), text(club, 'adressesalle3')]
    .filter(Boolean)
    .join(', ')

  const correspondent = parseCorrespondent(club)

  return {
    affiliationNumber,
    displayName: normalizeFfttName(rawName),
    venueLabel: text(club, 'nomsalle'),
    street,
    postalCode: text(club, 'codepsalle'),
    city: normalizeFfttName(text(club, 'villesalle')),
    ...(correspondent ? { correspondent } : {}),
  }
}

/**
 * The contact, or null when FFTT publishes nothing usable.
 *
 * "Nothing usable" is all four fields empty: a club with only a phone still has
 * a contact worth showing, while a record of four blanks is not a person. The
 * family name is title-cased like every other FFTT name; the address is left
 * exactly as published, because it is matched against what a requester typed.
 */
function parseCorrespondent(club: ParentNode): FfttCorrespondent | null {
  const lastName = text(club, 'nomcor')
  const firstName = text(club, 'prenomcor')
  const email = text(club, 'mailcor')
  const phone = text(club, 'telcor')
  if (!lastName && !firstName && !email && !phone) return null
  return {
    lastName: lastName ? normalizeFfttName(lastName) : '',
    firstName: firstName ? normalizeFfttName(firstName) : '',
    email,
    phone,
  }
}

/** "Prénom Nom" for a correspondent, or empty when FFTT names nobody. */
export function correspondentName(c: FfttCorrespondent | null | undefined): string {
  if (!c) return ''
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
}

/** Fetch a club's detail XML from the browser; null when unreachable. */
export async function fetchClubDetailXmlFromBrowser(affiliationNumber: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const safe = affiliationNumber.replace(/[^0-9A-Za-z]/g, '')
    const res = await fetch(`${FFTT_CLUB_DETAIL_URL}?club=${safe}`, { signal: controller.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
