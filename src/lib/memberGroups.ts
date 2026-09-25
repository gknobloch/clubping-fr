import type { MemberGroup, Role } from '../types'

// ---------------------------------------------------------------------------
// A club's own groups of members (#602)
//
// The one place that answers "who is in what", shared by the web
// (`@/lib/memberGroups`), the app (`@shared/lib/memberGroups`) and, for the
// name rule, the API. Pure: no network, no context.
// ---------------------------------------------------------------------------

/**
 * How several chosen groups combine: `any` keeps whoever is in at least one of
 * them (OU), `all` only whoever is in every one (ET).
 */
export type GroupMatch = 'any' | 'all'

/**
 * Said as a sentence about the member rather than as a boolean operator: a
 * club secretary reads "Dans tous" without knowing what ET means in a filter.
 */
export const GROUP_MATCH_LABELS: Record<GroupMatch, string> = {
  any: 'Au moins un groupe',
  all: 'Tous les groupes',
}

/**
 * The answer to creating or renaming a group. Both are awaited rather than
 * optimistic, on web and app alike: the one refusal that matters — a name the
 * club already uses — is the server's to give, and a list showing two
 * « Jeunes » until the next reload would be worse than a moment's wait.
 */
export type MemberGroupResult = { ok: true; group: MemberGroup } | { ok: false; message: string }

export const MEMBER_GROUP_MESSAGES = {
  empty: 'Donnez un nom au groupe.',
  nameTaken: 'Le club a déjà un groupe de ce nom.',
  failed: "Le groupe n'a pas pu être enregistré. Réessayez.",
} as const

/** Who defines a club's groups and files members into them. */
export function mayManageMemberGroups(
  viewer: { role: Role; clubId?: string } | null | undefined,
  clubId: string | undefined,
): boolean {
  if (!viewer) return false
  if (viewer.role === 'general_admin') return true
  return viewer.role === 'club_admin' && !!clubId && viewer.clubId === clubId
}

const byName = (a: MemberGroup, b: MemberGroup) =>
  a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' })

/** One club's groups, alphabetical — the order every screen lists them in. */
export function clubMemberGroups(groups: MemberGroup[], clubId: string | undefined): MemberGroup[] {
  if (!clubId) return []
  return groups.filter((g) => g.clubId === clubId).sort(byName)
}

/** The groups a member belongs to, alphabetical. */
export function groupsOfMember(groups: MemberGroup[], memberId: string | undefined): MemberGroup[] {
  if (!memberId) return []
  return groups.filter((g) => g.memberIds.includes(memberId)).sort(byName)
}

/**
 * The filter a list applies, as a predicate on a member's id.
 *
 * Nothing chosen keeps everybody: an empty filter is no filter, in either
 * mode — `all` of nothing would otherwise be vacuously true and `any` of
 * nothing false, and the list would empty the moment the last chip is lifted.
 *
 * A chosen id no longer among `groups` (deleted from another device) is
 * dropped rather than matched: under `all` it would empty the list for a
 * reason nobody can see on screen.
 */
export function memberGroupFilter(
  groups: MemberGroup[],
  selectedIds: readonly string[],
  mode: GroupMatch,
): (memberId: string) => boolean {
  const chosen = groups.filter((g) => selectedIds.includes(g.id))
  if (chosen.length === 0) return () => true
  const sets = chosen.map((g) => new Set(g.memberIds))
  return mode === 'all'
    ? (id) => sets.every((s) => s.has(id))
    : (id) => sets.some((s) => s.has(id))
}

/**
 * A group name as it is stored: trimmed, inner runs of spaces folded. What a
 * club types by hand on a phone is where a double space comes from.
 */
export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

const nameKey = (name: string) => normalizeGroupName(name).toLocaleLowerCase('fr')

/**
 * Whether a club already has a group by that name, ignoring case — two
 * « Jeunes » would be a filter nobody can read. `exceptId` is the group being
 * renamed, which may keep its own name.
 */
export function groupNameTaken(
  groups: MemberGroup[],
  clubId: string,
  name: string,
  exceptId?: string,
): boolean {
  const key = nameKey(name)
  return groups.some((g) => g.clubId === clubId && g.id !== exceptId && nameKey(g.displayName) === key)
}

/** Replace one group's members. Pure — both data contexts apply it optimistically. */
export function withGroupMembers(
  groups: MemberGroup[],
  groupId: string,
  memberIds: string[],
): MemberGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, memberIds: [...new Set(memberIds)] } : g))
}

/**
 * Replace the groups one member belongs to, within one club: they join every
 * group of `groupIds` and leave every other group of that club. Another club's
 * groups are never touched — a member moved between clubs keeps nothing of the
 * old one's through this, and gains nothing of it either.
 */
export function withMemberGroups(
  groups: MemberGroup[],
  clubId: string,
  memberId: string,
  groupIds: readonly string[],
): MemberGroup[] {
  return groups.map((g) => {
    if (g.clubId !== clubId) return g
    const has = g.memberIds.includes(memberId)
    const wants = groupIds.includes(g.id)
    if (has === wants) return g
    return {
      ...g,
      memberIds: wants ? [...g.memberIds, memberId] : g.memberIds.filter((id) => id !== memberId),
    }
  })
}
