import type { Address, Club, Team } from '../types'
import { UNNAMED_HALL, formatAddress } from './address'
import { townFromClubName } from './clubTown'

/**
 * The address a home team's games are played at: its configured game location
 * if set, else the club's default (or first) address. The whole address, not
 * the short label — this is what a calendar hands to a maps app (#426).
 */
export function getVenueAddress(homeTeam: Team | undefined, clubs: Club[]): Address | undefined {
  if (!homeTeam) return undefined
  const gameLocation = clubs.flatMap((c) => c.addresses ?? []).find((a) => a.id === homeTeam.gameLocationId)
  if (gameLocation) return gameLocation
  const homeClub = clubs.find((c) => c.id === homeTeam.clubId)
  return homeClub?.addresses?.find((a) => a.isDefault) ?? homeClub?.addresses?.[0]
}

/**
 * The home club's town, guessed from its name (#611) — for a club with no
 * address at all, the opponent an import created bare and FFTT could not fill
 * (#613).
 */
function homeTown(homeTeam: Team | undefined, clubs: Club[]): string | undefined {
  const homeClub = homeTeam && clubs.find((c) => c.id === homeTeam.clubId)
  return homeClub ? townFromClubName(homeClub.displayName) : undefined
}

// Venue label for a home team's games: the hall and its city — the configured
// game location if set, else the club's default (or first) address — else the
// town the club's name carries.
export function getVenue(homeTeam: Team | undefined, clubs: Club[]): string | undefined {
  const addr = getVenueAddress(homeTeam, clubs)
  if (!addr) return homeTown(homeTeam, clubs)
  const name = hallName(addr)
  return name ? `${name}, ${addr.city}` : addr.city
}

/**
 * The hall's name, whenever the address carries one (#611) — the configured
 * game location's, the club's default address's, or the one FFTT published
 * for an opponent (#613). Never the placeholder an import writes when FFTT
 * names no hall: « Salle » is not a name.
 */
function hallName(addr: Address): string | undefined {
  const label = addr.label?.trim()
  return label && label.toLocaleLowerCase('fr-FR') !== UNNAMED_HALL.toLocaleLowerCase('fr-FR') ? label : undefined
}

/**
 * Where a match is played, as the accueil and the match screen spell it out
 * (#611): an address when one is on file, else the town the home club's name
 * carries.
 */
export type MatchVenue =
  | {
      kind: 'address'
      /** The hall's name, when the address carries a real one. */
      name?: string
      address: Address
    }
  | { kind: 'town'; town: string }

/**
 * The match's place — the hall and its address, or failing any address the
 * home club's town — or `undefined` when there is neither. The town is the
 * usual answer away from home until the FFTT fill (#613) has run: the imports
 * create an opponent's club with a name and nothing else.
 */
export function getMatchVenue(homeTeam: Team | undefined, clubs: Club[]): MatchVenue | undefined {
  const address = getVenueAddress(homeTeam, clubs)
  if (address && formatAddress(address)) return { kind: 'address', name: hallName(address), address }
  const town = homeTown(homeTeam, clubs)
  return town ? { kind: 'town', town } : undefined
}

/**
 * A venue as both platforms print it: the hall's name when there is one, the
 * line under it, and what a maps app is asked to find — the street address,
 * never the hall's name (a geocoder asked for « Salle des sports » finds a
 * hundred of them), or the town.
 */
export function venueText(venue: MatchVenue): { name?: string; line: string; query: string } {
  if (venue.kind === 'town') return { line: venue.town, query: `${venue.town}, France` }
  const line = formatAddress(venue.address)
  return { name: venue.name, line, query: line }
}
