import type { Address, Club, Team } from '../types'

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
  // Only a configured game location earns its label: the club's own address is
  // a fallback, and naming it would claim a venue nobody set.
  const isGameLocation = addr.id === homeTeam?.gameLocationId
  return isGameLocation && addr.label ? `${addr.label}, ${addr.city}` : addr.city
}
