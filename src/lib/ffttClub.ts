// FFTT club detail import (#247), browser-side like the other FFTT imports
// (#229/#231): FFTT/dafunker block Cloudflare's egress IPs, so this is fetched
// from the browser and handed to the app's own club-creation flow (`addClub`)
// — a single club has no cross-entity linking to validate server-side, unlike
// divisions/teams/games, so there's no dedicated preview/import API endpoint.
//
// Source: GET https://fftt.dafunker.com/v1/proxy/xml_club_detail.php?club=<affiliationNumber>
//   <liste><club><numero/><nom/><nomsalle/><adressesalle1/><adressesalle2/>
//   <adressesalle3/><codepsalle/><villesalle/>...</club></liste>
// An unknown club number returns a <liste> with no <club> child.

const FFTT_CLUB_DETAIL_URL = 'https://fftt.dafunker.com/v1/proxy/xml_club_detail.php'
const TIMEOUT_MS = 15000

/** A parsed club detail: identity plus its single game venue. */
export interface FfttClubDetail {
  affiliationNumber: string
  displayName: string
  venueLabel: string
  street: string
  postalCode: string
  city: string
}

function text(node: ParentNode, tag: string): string {
  return node.querySelector(tag)?.textContent?.trim() ?? ''
}

/**
 * FFTT club/city names come back in ALL CAPS. Title-case each word so it
 * reads normally ("BERGHEIM" → "Bergheim"), except short all-caps tokens
 * (<=4 letters) which are club-type abbreviations ("TT", "PPA", "CSS",
 * "CPPC") and must stay as-is. Hyphenated words are title-cased segment by
 * segment ("SAINT-LOUIS" → "Saint-Louis").
 */
export function normalizeFfttName(raw: string): string {
  return raw
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((seg) =>
          seg.length <= 4 ? seg : seg.charAt(0).toLocaleUpperCase('fr-FR') + seg.slice(1).toLocaleLowerCase('fr-FR'),
        )
        .join('-'),
    )
    .join(' ')
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

/** Whether a club detail carries any usable game-venue information at all. */
/**
 * FFTT-aligned club id (#275): `club-fftt-<affiliationNumber>`, the format the
 * games and schedule-document imports already produce for the clubs they
 * auto-create (clubIdFor). Returns null when the number isn't a usable FFTT
 * affiliation number, in which case the caller falls back to a generated id —
 * a club can legitimately have no number (its column is nullable since
 * migration 0019).
 */
export function clubIdFromAffiliation(affiliationNumber: string | undefined): string | null {
  const n = (affiliationNumber ?? '').trim()
  return /^\d{8}$/.test(n) ? `club-fftt-${n}` : null
}

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

  return {
    affiliationNumber,
    displayName: normalizeFfttName(rawName),
    venueLabel: text(club, 'nomsalle'),
    street,
    postalCode: text(club, 'codepsalle'),
    city: normalizeFfttName(text(club, 'villesalle')),
  }
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
