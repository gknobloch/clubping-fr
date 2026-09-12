// Reading a licensee's age category for a season (#482).
//
// Shared domain logic — keep it free of any browser/RN/Node deps.
//
// The category used to be one field on the licensee, which made "what category
// is this player?" a question with one answer for all time. It is not: a cadet
// becomes a junior, a V45 becomes a V50, and the answer that mattered for last
// season's championship is not the answer that matters for this one. So the
// address is (season, player) — the same move points made to (phase, player) in
// #384, one grain up, because a licence is issued for a season.

import type { PlayerSeasonCategory } from '../types'

/**
 * A licensee carrying the category of one particular season.
 *
 * The category is not a field on the person any more, so a screen that wants
 * to reason about "this player, this season" resolves it first and passes the
 * pair around. The eligibility rules read exactly this shape.
 */
export type CategorizedPlayer<T> = T & { category: string | undefined }

/** The category a player held in a season, or undefined when none is recorded. */
export function categoryFor(
  rows: PlayerSeasonCategory[],
  seasonId: string | undefined,
  playerId: string | undefined,
): string | undefined {
  if (!seasonId || !playerId) return undefined
  return rows.find((r) => r.seasonId === seasonId && r.playerId === playerId)?.category
}

/**
 * A (season, player) → category lookup, for screens that read a whole club's
 * categories at once — the eligibility grid asks for forty of them per render.
 */
export function seasonCategoryIndex(rows: PlayerSeasonCategory[]): Map<string, string> {
  return new Map(rows.map((r) => [`${r.seasonId} ${r.playerId}`, r.category]))
}

/** Read from an index built by `seasonCategoryIndex`. */
export function categoryFromIndex(
  index: Map<string, string>,
  seasonId: string | undefined,
  playerId: string | undefined,
): string | undefined {
  if (!seasonId || !playerId) return undefined
  return index.get(`${seasonId} ${playerId}`)
}

/**
 * Every season a category is on file for, most recent first.
 *
 * Season ids are the FFTT's ("26", "27"), so they sort numerically — and the
 * player screen wants the newest at the top, since that is the one being asked
 * about nine times in ten.
 */
export function categoryHistory(
  rows: PlayerSeasonCategory[],
  playerId: string,
): PlayerSeasonCategory[] {
  return rows
    .filter((r) => r.playerId === playerId)
    .sort((a, b) => Number(b.seasonId) - Number(a.seasonId))
}

/** Attach each player's category for one season, for a screen that shows a club. */
export function withSeasonCategory<T extends { id: string }>(
  players: T[],
  rows: PlayerSeasonCategory[],
  seasonId: string | undefined,
): CategorizedPlayer<T>[] {
  const index = seasonCategoryIndex(rows)
  // The key is always set, undefined included: the eligibility rule asks for it
  // by name, so that a caller who never resolved a category cannot pass for one
  // who resolved it and found none.
  return players.map((p) => ({ ...p, category: categoryFromIndex(index, seasonId, p.id) }))
}
