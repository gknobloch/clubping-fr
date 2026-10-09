// A licensee's profiles in other clubs, and the clubs one may add them to (#644).
//
// Shared domain logic — imported by the web app (@/lib/linkedProfiles) and the
// mobile app (@shared/lib/linkedProfiles). Keep this module free of any
// browser/RN/Node deps.
//
// A session is one member in one club (#640), so playing for two clubs is two
// profiles, and the address is what links them: the same comparison as at
// sign-in (`sameAddress` in functions/api/auth.ts) — case aside, and no
// address shares nothing.
import type { Club, Player, Role } from '../types'

const addressOf = (p: Pick<Player, 'email'>) => p.email?.trim().toLowerCase() ?? ''

/** The licensee's other profiles — same address, another row — in club order of the list. */
export function linkedProfiles<P extends Pick<Player, 'id' | 'email'>>(player: P, players: readonly P[]): P[] {
  const address = addressOf(player)
  if (!address) return []
  return players.filter((p) => p.id !== player.id && addressOf(p) === address)
}

/**
 * The clubs a viewer may give this licensee a profile in: those the viewer
 * administers — every club for a general admin, their own for a club admin, the
 * rule `POST /players/:id/profiles` applies (#558) — less the licensee's own
 * club, any club already holding one of their profiles, and archived clubs.
 */
export function clubsToAddTo(
  player: Pick<Player, 'id' | 'email' | 'clubId'>,
  viewer: { role: Role; clubId?: string } | null | undefined,
  clubs: readonly Club[],
  players: ReadonlyArray<Pick<Player, 'id' | 'email' | 'clubId'>>,
): Club[] {
  if (!viewer) return []
  const held = new Set([player.clubId, ...linkedProfiles(player, players).map((p) => p.clubId)])
  return clubs.filter((c) =>
    !c.isArchived && !held.has(c.id)
    && (viewer.role === 'general_admin' || (viewer.role === 'club_admin' && viewer.clubId === c.id)))
}
