/**
 * Who is in the club directory, and who may look past it (#438).
 *
 * An archived player has left the club. For a member looking someone up, they
 * are noise at best and a wrong phone number at worst — so the roster is the
 * active players, full stop, and there is no control offered to widen it.
 *
 * The people who administer the club still need them: an archived member is
 * how a season ends, and re-activating one is a normal move. They get the
 * toggle — off the active-only default, on again — but it starts closed for
 * them too, because they open this page to find someone just like everyone else.
 *
 * Structurally typed rather than importing `Role`/`Player`: this file is one of
 * the `@shared/lib` modules the mobile app compiles from ../src, where `@/`
 * resolves somewhere else entirely.
 */

/** French UI label of the toggle, identical on both apps. */
export const ACTIVE_ONLY_LABEL = 'Joueurs actifs uniquement'

/** Only club and general admins may see archived players. */
export function canSeeArchivedPlayers(role: string | undefined): boolean {
  return role === 'general_admin' || role === 'club_admin'
}

/**
 * The players a member is allowed to see, given the state of their toggle.
 * `activeOnly` is ignored for anyone who may not see the archived ones — their
 * list is the active players whatever the flag says.
 */
export function visiblePlayers<T extends { status: string }>(
  players: T[],
  { role, activeOnly }: { role: string | undefined; activeOnly: boolean },
): T[] {
  if (!activeOnly && canSeeArchivedPlayers(role)) return players
  return players.filter((p) => p.status === 'active')
}

/**
 * Who a captain may field (#454).
 *
 * An archived player has left the club, so they are never offered for a
 * line-up. One already picked stays listed, though: dropping them from the
 * sheet would leave a stale name in the composition with no way to remove it.
 */
export function selectablePlayers<T extends { id: string; status: string }>(
  players: T[],
  alreadySelected: Iterable<string>,
): T[] {
  const kept = new Set(alreadySelected)
  return players.filter((p) => p.status === 'active' || kept.has(p.id))
}
