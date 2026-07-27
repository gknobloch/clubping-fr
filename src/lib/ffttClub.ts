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
