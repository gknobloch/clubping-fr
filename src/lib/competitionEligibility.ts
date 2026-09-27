// Who may play in which competition (#482, #604).
//
// Shared domain logic — imported by the web app (@/lib/competitionEligibility),
// by the mobile app (@shared/lib/competitionEligibility) and by the API, so
// keep it free of any browser/RN/Node deps. The type imports below are
// type-only, so they carry no runtime dependency.
//
// One rule, one place. The club screen lists who a competition admits, the
// line-up sheet drops a name, the journées matrix offers a team — and all of
// them have to agree.
//
// The rule is two conditions, and both must hold (#604):
//
// - the competition's **categories**, set by a general admin — none listed
//   means every category;
// - the club's **group** for that competition, if the club has set one — one
//   of its own member groups (#602).
//
// It replaced a per-licensee list of exclusions and additions (#482), which
// each arrival, each August category change and each departure left a little
// more wrong. A group is maintained once, for everything the club uses it for.
// And because a group can only narrow, a club can no longer widen a
// competition past its categories — which is what the "lock" existed to stop,
// so the lock is gone with it.

import type { Competition, CompetitionEligibility, CompetitionGroup, MemberGroup } from '../types'
import { normalizeCategory, type PlayerCategory } from './playerCategories'

/**
 * Why a player is, or is not, eligible. The club screen prints it: a member of
 * the group whose category does not fit is shown greyed, with the reason.
 */
export type EligibilityReason =
  | 'eligible'
  /** Their category fits, but the club restricted the competition to a group they are not in. */
  | 'not_in_group'
  /** They hold a category the competition does not admit. */
  | 'category_mismatch'
  /** They hold no category at all — nothing to match against. */
  | 'no_category'

export interface EligibilityVerdict {
  eligible: boolean
  reason: EligibilityReason
}

/** French wording of a verdict, for a list that has to say why. */
export const ELIGIBILITY_REASON_LABELS: Record<EligibilityReason, string> = {
  eligible: 'Éligible',
  not_in_group: 'Hors du groupe',
  category_mismatch: 'Hors catégorie',
  no_category: 'Sans catégorie',
}

/**
 * The subset of a member this module reads.
 *
 * `category` is required, and may be undefined — deliberately not optional. A
 * licensee carries no category of their own since #482: it belongs to a season,
 * and has to be resolved (`src/lib/seasonCategories.ts`) before the rule can
 * read it. Made optional, a raw `User` satisfied this shape and every caller
 * that forgot silently read "sans catégorie", so a competition naming its
 * categories admitted nobody at all. Spelling it out makes the omission a
 * compile error instead.
 */
export interface EligiblePlayer {
  id: string
  /** Raw FFTT category code; normalized here. Undefined = none on file. */
  category: string | undefined
}

/** A club's group, as the rule reads it: who is in it. */
export type RestrictingGroup = Pick<MemberGroup, 'memberIds'>

/** Whether the competition's own mapping admits this category. */
export function categoryAdmitted(
  competition: Pick<Competition, 'categories'>,
  category: PlayerCategory | undefined,
): boolean {
  // No categories listed is the competition saying "anyone" — including
  // someone FFTT gave no category at all.
  if (competition.categories.length === 0) return true
  return category !== undefined && competition.categories.includes(category)
}

/**
 * Whether this player may play in this competition, and on what grounds.
 *
 * The category is asked first, so a member of the group whose category does
 * not fit reads « Hors catégorie » — the thing the club screen greys them for
 * — rather than as though the group were the problem.
 */
export function playerEligibility(
  player: EligiblePlayer,
  competition: Pick<Competition, 'categories'>,
  group?: RestrictingGroup,
): EligibilityVerdict {
  const category = normalizeCategory(player.category)
  if (!categoryAdmitted(competition, category)) {
    return { eligible: false, reason: category === undefined ? 'no_category' : 'category_mismatch' }
  }
  if (group && !group.memberIds.includes(player.id)) return { eligible: false, reason: 'not_in_group' }
  return { eligible: true, reason: 'eligible' }
}

/** Shorthand for the many callers that only want the yes or the no. */
export function isPlayerEligible(
  player: EligiblePlayer,
  competition: Pick<Competition, 'categories'>,
  group?: RestrictingGroup,
): boolean {
  return playerEligibility(player, competition, group).eligible
}

/**
 * The players a competition admits, out of a club's list.
 *
 * `competition` may be undefined — a division belonging to no competition
 * restricts nobody, which is every division until a general admin says
 * otherwise, so the whole list comes back untouched.
 */
export function eligiblePlayers<T extends EligiblePlayer>(
  players: T[],
  competition: Pick<Competition, 'categories'> | undefined,
  group?: RestrictingGroup,
): T[] {
  if (!competition) return players
  return players.filter((p) => isPlayerEligible(p, competition, group))
}

/**
 * What the club's Compétitions screen lists for one competition (#604).
 *
 * `eligible` is who the competition admits. `outOfCategory` is who the club put
 * in the group but the categories turn away — shown greyed, with the reason,
 * so a club sees that its group says one thing and the competition another.
 * Without a group there is no such list: nobody asked for them.
 */
export function competitionRoster<T extends EligiblePlayer>(
  players: T[],
  competition: Pick<Competition, 'categories'>,
  group?: RestrictingGroup,
): { eligible: T[]; outOfCategory: Array<{ player: T; reason: EligibilityReason }> } {
  const eligible: T[] = []
  const outOfCategory: Array<{ player: T; reason: EligibilityReason }> = []
  for (const player of players) {
    const verdict = playerEligibility(player, competition, group)
    if (verdict.eligible) eligible.push(player)
    else if (group?.memberIds.includes(player.id)) outOfCategory.push({ player, reason: verdict.reason })
  }
  return { eligible, outOfCategory }
}

/**
 * Who an équipe already fields but the club's group leaves out (#604) — the
 * one contradiction the club's screen warns about, because it is the one the
 * group can settle: each of them is admitted by the categories, and adding
 * them to the group makes them eligible again.
 *
 * Nobody without a group (nothing is restricted), and never someone the
 * categories refuse: no group could let them in, so a warning would ask for
 * something the club cannot do.
 */
export function engagedOutsideGroup<T extends EligiblePlayer>(
  players: T[],
  competition: Pick<Competition, 'categories'>,
  group: RestrictingGroup | undefined,
  isEngaged: (playerId: string) => boolean,
): T[] {
  if (!group) return []
  return players.filter((p) =>
    isEngaged(p.id)
    && !group.memberIds.includes(p.id)
    && playerEligibility(p, competition).eligible)
}

/**
 * The group a club restricted a competition to, or undefined when it set none.
 *
 * A link to a group that no longer exists reads as no group at all: deleting a
 * group lifts the restriction (the API deletes the link with it, and the club
 * screen says so before the group goes).
 */
export function competitionGroupOf(
  clubId: string | undefined,
  competitionId: string,
  competitionGroups: CompetitionGroup[],
  memberGroups: MemberGroup[],
): MemberGroup | undefined {
  if (!clubId) return undefined
  const link = competitionGroups.find((l) => l.clubId === clubId && l.competitionId === competitionId)
  return link ? memberGroups.find((g) => g.id === link.groupId) : undefined
}

/**
 * The rule a division's teams play under: its competition, narrowed by whatever
 * the division says for itself.
 *
 * Undefined covers three cases that are all the same answer — the division is
 * unknown, it belongs to no competition, or the competition is archived — and
 * every caller treats it identically: nothing is restricted.
 *
 * When the division carries its own categories they REPLACE the competition's,
 * because the more specific statement wins: a youth championship whose lowest
 * division is reserved to benjamins and minimes says so on the division, and
 * the competition's wider list is not consulted. The identity returned is still
 * the competition's, so a club's group hangs off the championship rather than
 * fragmenting per division.
 */
export function competitionOfDivision(
  divisionId: string | undefined,
  divisions: Array<{ id: string; competitionId?: string; categories?: PlayerCategory[] }>,
  competitions: Competition[],
): Competition | undefined {
  const division = divisions.find((d) => d.id === divisionId)
  if (!division?.competitionId) return undefined
  const competition = competitions.find((c) => c.id === division.competitionId)
  if (!competition || competition.isArchived) return undefined
  return division.categories ? { ...competition, categories: division.categories } : competition
}

/**
 * The competitions a club takes part in, and the rest (#604).
 *
 * Played: one of its active teams sits in a division filed under it, or the
 * club has reserved it to a group — a choice it made is never hidden. The rest
 * are what a general admin configured for other clubs' championships, and the
 * club's screen folds them away rather than asking about each one.
 * Both lists keep the competitions' own order; archived ones are in neither.
 */
export function competitionsOfClub(
  clubId: string,
  competitions: Competition[],
  teams: Array<{ clubId: string; divisionId?: string; isArchived?: boolean }>,
  divisions: Array<{ id: string; competitionId?: string; categories?: PlayerCategory[] }>,
  competitionGroups: CompetitionGroup[],
): { played: Competition[]; others: Competition[] } {
  const ids = new Set<string>()
  for (const t of teams) {
    if (t.clubId !== clubId || t.isArchived) continue
    const c = competitionOfDivision(t.divisionId, divisions, competitions)
    if (c) ids.add(c.id)
  }
  for (const l of competitionGroups) if (l.clubId === clubId) ids.add(l.competitionId)
  const active = competitions.filter((c) => !c.isArchived).sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    played: active.filter((c) => ids.has(c.id)),
    others: active.filter((c) => !ids.has(c.id)),
  }
}

/** The subset of a team the rule below reads. */
export interface EligibilityTeam {
  id: string
  clubId: string
  divisionId?: string
  playerIds?: string[]
}

/** Everything the rule needs besides the team and the licensee. */
export interface TeamEligibilityContext {
  divisions: Array<{ id: string; competitionId?: string; categories?: PlayerCategory[] }>
  competitions: Competition[]
  /** The clubs' competition → group links. Read per team, by the team's own club. */
  competitionGroups: CompetitionGroup[]
  memberGroups: MemberGroup[]
}

export interface TeamEligibility {
  /** The competition's own verdict, whatever a team already holds. */
  admits(teamId: string, player: EligiblePlayer): boolean
  /**
   * Whether a picker may offer this team for this licensee: `admits`, or a
   * roster that already holds them.
   *
   * Eligibility bites on what can be *added*, never on what exists — a group
   * or a competition edited after the fact must not empty a squad — so
   * someone on the roster stays fieldable for their own team, and shows as a
   * ⚠ on the club's Compétitions screen rather than as a silent removal.
   */
  mayField(teamId: string, player: EligiblePlayer): boolean
}

/**
 * The rule for "which of a club's teams may field this licensee?", bound to one
 * set of teams.
 *
 * A factory rather than a bare function because a team reaches its competition
 * through its division — two lookups — and its group through its club, and
 * the callers ask this of every licensee against every team: the journées
 * matrix on both apps, a roster picker, a line-up sheet. Resolving each team's
 * rule once is the same move `assignmentsByPlayer` makes.
 */
export function teamEligibility(
  teams: EligibilityTeam[],
  ctx: TeamEligibilityContext,
): TeamEligibility {
  const byId = new Map(teams.map((t) => [t.id, t]))
  const ruleByTeamId = new Map(teams.map((t) => {
    const competition = competitionOfDivision(t.divisionId, ctx.divisions, ctx.competitions)
    const group = competition
      ? competitionGroupOf(t.clubId, competition.id, ctx.competitionGroups, ctx.memberGroups)
      : undefined
    return [t.id, { competition, group }]
  }))
  const admits = (teamId: string, player: EligiblePlayer): boolean => {
    const rule = ruleByTeamId.get(teamId)
    // A division filed under no competition — every division until a general
    // admin says otherwise — restricts nobody. So does a team we know nothing
    // about: silence is not a refusal.
    if (!rule?.competition) return true
    return isPlayerEligible(player, rule.competition, rule.group)
  }
  return {
    admits,
    mayField: (teamId, player) =>
      byId.get(teamId)?.playerIds?.includes(player.id) === true || admits(teamId, player),
  }
}

/**
 * The group rule, restated as the per-licensee exclusions app ≤ 1.5 still
 * reads (#604).
 *
 * An installed app is not updated when the server is. Those builds read
 * `competitionEligibilities` from `GET /api/data`, and in their copy of the
 * rule an `excluded` row beats everything. So one row per club member outside
 * the group reproduces the group rule exactly: a member of the group whose
 * category does not fit gets no row, and their own copy already says « Hors
 * catégorie ». An old phone offers the same players as a new one, and no
 * forced update is needed.
 *
 * **Temporary.** Removed with the field itself, once `users.last_client_version`
 * shows no build older than the one that reads `competitionGroups` — see #604.
 */
export function legacyCompetitionExclusions(
  competitionGroups: CompetitionGroup[],
  memberGroups: MemberGroup[],
  players: Array<{ id: string; clubId: string }>,
): CompetitionEligibility[] {
  const out: CompetitionEligibility[] = []
  for (const link of competitionGroups) {
    const group = memberGroups.find((g) => g.id === link.groupId)
    if (!group) continue
    const members = new Set(group.memberIds)
    for (const p of players) {
      if (p.clubId === link.clubId && !members.has(p.id)) {
        out.push({ clubId: link.clubId, competitionId: link.competitionId, playerId: p.id, effect: 'excluded' })
      }
    }
  }
  return out
}
