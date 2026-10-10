// A licensee's profiles in other clubs, and the clubs one may add them to (#644).
//
// Shared domain logic — imported by the web app (@/lib/linkedProfiles) and the
// mobile app (@shared/lib/linkedProfiles). Keep this module free of any
// browser/RN/Node deps.
//
// A session is one club profile (#640), so playing for two clubs is two
// profiles of ONE PERSON (#655): Gilles at Rixheim and at Landser. The person
// is what links them — never the address, which a parent and a child may share
// while being two people.
import type { Club, Player, Role } from '../types'

type Linkable = Pick<Player, 'id' | 'email' | 'personId'>

const addressOf = (p: Pick<Player, 'email'>) => p.email?.trim().toLowerCase() ?? ''

/**
 * The person's other club profiles, in the order of the list. A cache from
 * before #655 carries no person: the address stands in for it there, compared
 * as at sign-in (`sameAddress` in functions/api/auth.ts) — case aside, and no
 * address shares nothing.
 */
export function linkedProfiles<P extends Linkable>(player: P, players: readonly P[]): P[] {
  if (player.personId) return players.filter((p) => p.id !== player.id && p.personId === player.personId)
  const address = addressOf(player)
  if (!address) return []
  return players.filter((p) => p.id !== player.id && addressOf(p) === address)
}

/**
 * Whether a viewer may change what describes this person — name, address,
 * phone, birth (#655). Shared by every club profile of theirs, so on a person
 * playing in two clubs it is the person's own (from « Mon compte ») and a
 * general admin's; a person in one club is still the club admin's to correct
 * (#600). The rule `PATCH /players/:id` applies.
 */
export function mayEditPerson(
  player: Linkable & Pick<Player, 'clubId'>,
  viewer: { role: Role; clubId?: string } | null | undefined,
  players: ReadonlyArray<Linkable & Pick<Player, 'clubId'>>,
): boolean {
  if (!viewer) return false
  if (viewer.role === 'general_admin') return true
  if (viewer.role !== 'club_admin') return false
  const clubs = [player, ...linkedProfiles(player, players)].map((p) => p.clubId)
  return clubs.every((club) => club === viewer.clubId)
}

/**
 * The clubs a viewer may give this licensee a profile in: those the viewer
 * administers — every club for a general admin, their own for a club admin, the
 * rule `POST /players/:id/profiles` applies (#558) — less the licensee's own
 * club, any club already holding one of their profiles, and archived clubs.
 */
export function clubsToAddTo(
  player: Linkable & Pick<Player, 'clubId'>,
  viewer: { role: Role; clubId?: string } | null | undefined,
  clubs: readonly Club[],
  players: ReadonlyArray<Linkable & Pick<Player, 'clubId'>>,
): Club[] {
  if (!viewer) return []
  const held = new Set([player.clubId, ...linkedProfiles(player, players).map((p) => p.clubId)])
  return clubs.filter((c) =>
    !c.isArchived && !held.has(c.id)
    && (viewer.role === 'general_admin' || (viewer.role === 'club_admin' && viewer.clubId === c.id)))
}
