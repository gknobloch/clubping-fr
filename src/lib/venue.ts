import type { Address, Club, Team } from '../types'
import { formatAddress } from './address'

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

// Venue label for a home team's games: its configured game location if set,
// else the club's default (or first) address's city.
export function getVenue(homeTeam: Team | undefined, clubs: Club[]): string | undefined {
  const addr = getVenueAddress(homeTeam, clubs)
  if (!addr) return undefined
  const name = venueName(addr, homeTeam)
  return name ? `${name}, ${addr.city}` : addr.city
}

// Only a configured game location earns its label: the club's own address is
// a fallback, and naming it would claim a venue nobody set.
function venueName(addr: Address, homeTeam: Team | undefined): string | undefined {
  return addr.id === homeTeam?.gameLocationId && addr.label ? addr.label : undefined
}

/** Where a match is played, as the match screens spell it out (#611). */
export interface MatchVenue {
  /** The hall's name — only for the home team's configured game location. */
  name?: string
  address: Address
}

/**
 * The match's place in full — the hall, then the address a maps app is asked
 * to find — or `undefined` when nothing usable is on file. That is the usual
 * answer away from home: the imports create an opponent's club without any
 * address, and only a club that uses the app fills its own in.
 */
export function getMatchVenue(homeTeam: Team | undefined, clubs: Club[]): MatchVenue | undefined {
  const address = getVenueAddress(homeTeam, clubs)
  if (!address || !formatAddress(address)) return undefined
  return { name: venueName(address, homeTeam), address }
}
