// Who may play in which competition (#482).
//
// Shared domain logic — imported by the web app (@/lib/competitionEligibility)
// and readable from the API, so keep it free of any browser/RN/Node deps. The
// type imports below are type-only, so they carry no runtime dependency.
//
// One rule, one place. The club screen greys a button, the API refuses a write
// and the line-up sheet drops a name, and all three have to agree — the way
// src/lib/clubAdmins.ts already does for the five-admin cap (#474).

import type { Competition, CompetitionEligibility, EligibilityEffect } from '../types'
import { normalizeCategory, type PlayerCategory } from './playerCategories'

/**
 * Why a player is, or is not, eligible. The screens print this: "exclu par le
 * club" and "hors catégorie" are not the same answer, and the second is the
 * one a club admin can do something about.
 */
export type EligibilityReason =
  /** The competition's default mapping admits them. */
  | 'category'
  /** Their club added them, past a default that would not have. */
  | 'club_added'
  /** Their club took them out of a default that would have admitted them. */
  | 'club_excluded'
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
  category: 'Par sa catégorie',
  club_added: 'Ajouté par le club',
  club_excluded: 'Exclu par le club',
  category_mismatch: 'Hors catégorie',
  no_category: 'Sans catégorie',
}

/** The subset of a member this module reads. */
export interface EligiblePlayer {
  id: string
  /** Raw FFTT category code; normalized here. */
  category?: string
}

const overrideFor = (
  overrides: CompetitionEligibility[],
  competitionId: string,
  playerId: string,
): EligibilityEffect | undefined =>
  overrides.find((o) => o.competitionId === competitionId && o.playerId === playerId)?.effect

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
 * Whether a club may add this player to this competition by hand.
 *
 * A locked competition is reserved to its categories: the club can still take
 * someone out of it, never put someone in. That is the whole difference
 * between "the default is usually right" and "this is a youth championship".
 */
export function canClubAdd(
  competition: Pick<Competition, 'categories' | 'isCategoryLocked'>,
  player: EligiblePlayer,
): boolean {
  if (!competition.isCategoryLocked) return true
  return categoryAdmitted(competition, normalizeCategory(player.category))
}

/**
 * Whether this player may play in this competition, and on what grounds.
 *
 * Order matters, and it is the club's word first: an exclusion beats the
 * default mapping, because a club knows something about its own licensee that
 * a category code cannot say. An addition beats the default too — except on a
 * locked competition, where it is void. The API refuses to write such a row in
 * the first place, and this does not rely on that: a competition locked after
 * the fact must not leave stale additions standing.
 */
export function playerEligibility(
  player: EligiblePlayer,
  competition: Pick<Competition, 'id' | 'categories' | 'isCategoryLocked'>,
  overrides: CompetitionEligibility[],
): EligibilityVerdict {
  const override = overrideFor(overrides, competition.id, player.id)
  if (override === 'excluded') return { eligible: false, reason: 'club_excluded' }

  const category = normalizeCategory(player.category)
  const admitted = categoryAdmitted(competition, category)

  if (override === 'included' && (admitted || !competition.isCategoryLocked)) {
    return { eligible: true, reason: admitted ? 'category' : 'club_added' }
  }
  if (admitted) return { eligible: true, reason: 'category' }
  return {
    eligible: false,
    reason: category === undefined ? 'no_category' : 'category_mismatch',
  }
}

/** Shorthand for the many callers that only want the yes or the no. */
export function isPlayerEligible(
  player: EligiblePlayer,
  competition: Pick<Competition, 'id' | 'categories' | 'isCategoryLocked'>,
  overrides: CompetitionEligibility[],
): boolean {
  return playerEligibility(player, competition, overrides).eligible
}

/**
 * The competitions this player may take part in, in the order given.
 *
 * This is the "what is this licensee eligible for?" question, and its answer is
 * a list: a cadet plays in their own category AND with the adults, which is why
 * eligibility could never be a field on the player.
 */
export function eligibleCompetitions<T extends Pick<Competition, 'id' | 'categories' | 'isCategoryLocked' | 'isArchived'>>(
  player: EligiblePlayer,
  competitions: T[],
  overrides: CompetitionEligibility[],
): T[] {
  return competitions.filter((c) => !c.isArchived && isPlayerEligible(player, c, overrides))
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
  competition: Pick<Competition, 'id' | 'categories' | 'isCategoryLocked'> | undefined,
  overrides: CompetitionEligibility[],
): T[] {
  if (!competition) return players
  return players.filter((p) => isPlayerEligible(p, competition, overrides))
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
 * the competition's — `id`, and the lock — so a club's derogations keep hanging
 * off the championship rather than fragmenting per division, and so the lock
 * stays a policy of the championship rather than of one of its levels.
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
