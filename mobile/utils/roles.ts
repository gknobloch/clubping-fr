import type { AvailabilityOverriddenBy, User, Team, Club } from '@shared/types'

export function getDisplayName(user: User): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
  }
  // E-mail was the last-resort label; a member may now have none (#315).
  return user.email ?? 'Utilisateur sans nom'
}

export function getRoleLabel(role: User['role']): string {
  const labels: Record<User['role'], string> = {
    general_admin: 'Administrateur général',
    club_admin: 'Administrateur de club',
    player: 'Joueur',
  }
  return labels[role]
}

/** Captaincy is per-team (team.captainId), so it's derived from the team. */
export function canManageTeam(user: User, team: Team): boolean {
  if (user.role === 'general_admin') return true
  if (user.role === 'club_admin') return user.clubId === team.clubId
  return team.captainId === user.id
}

/**
 * Who may set a player's availability: the player, their captain, or their
 * club's administrator — and nobody else (#462).
 *
 * Deliberately *not* `canManageTeam`, which is the line-up rule. The two look
 * alike and differ where it counts: a general administrator composes any team
 * but answers for no one. An availability is a personal declaration; the
 * captain and the club's own administrator are in that loop, someone
 * administering every club in the country is not.
 *
 * `src/lib/useMatchDayEditing.ts` is the reference — the web has held this rule
 * since long before the app grew a way to break it.
 */
export function canEditAvailability(user: User, team: Team, playerId: string): boolean {
  if (user.id === playerId) return true
  if (team.captainId === user.id) return true
  return user.role === 'club_admin' && user.clubId === team.clubId
}

/**
 * Who is answering for someone else, so the API can record it in
 * `game_availabilities.overridden_by`. `undefined` when the player answers for
 * themselves — which is also what clears a previous override.
 */
export function availabilityOverride(
  user: User,
  team: Team,
  playerId: string,
): AvailabilityOverriddenBy | undefined {
  if (user.id === playerId) return undefined
  if (team.captainId === user.id) return 'captain'
  if (user.role === 'club_admin' && user.clubId === team.clubId) return 'club_admin'
  return undefined
}

export function getTeamName(team: Team, clubs: Club[]): string {
  const club = clubs.find((c) => c.id === team.clubId)
  return club ? `${club.displayName} ${team.number}` : `Équipe ${team.number}`
}

export function canManageClub(user: User, clubId: string): boolean {
  if (user.role === 'general_admin') return true
  if (user.role === 'club_admin') return user.clubId === clubId
  return false
}
