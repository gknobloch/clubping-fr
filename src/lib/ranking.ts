// A player's ranking, as each federation states it (#646).
//
// Shared domain logic — imported by the web app (@/lib/ranking) and the mobile
// app (@shared/lib/ranking). Keep this module free of any browser/RN/Node deps.
//
// The FFTT ranks by POINTS — the higher, the better (1731 pts). The AGR ranks
// by a CLASSEMENT — 25 to 80 on Landser's list — which plays the same part and
// runs the other way: the lower, the better. Both are stored the same way, in
// `player_phase_points` keyed (phase, player): a phase belongs to one
// federation since #645, so the key says whose value it is, and Kembs's FFTT
// points and AGR classement never meet.
//
// The rule is a table here rather than columns on `federations`: there are two
// federations and both are known, and a third would add one line. What every
// screen must not do is guess — read the label and the direction from here.
import type { Phase, PlayerPhasePoints } from '../types'
import { FFTT_FEDERATION_ID, activePhaseOf } from './federations'
import { pointsFor } from './phasePoints'

export interface RankingRule {
  /** What a screen calls the value: « Points », « Classement ». */
  label: string
  /** The AGR's classement: 25 is better than 45. */
  lowerIsBetter: boolean
}

const FFTT_RULE: RankingRule = { label: 'Points', lowerIsBetter: false }

const RULES: Record<string, RankingRule> = {
  fftt: FFTT_RULE,
  agr: { label: 'Classement', lowerIsBetter: true },
}

/** A federation's rule — the FFTT's for one this table does not know. */
export function rankingRule(federationId: string | undefined): RankingRule {
  return (federationId && RULES[federationId]) || FFTT_RULE
}

/** The label a screen prints beside the value. */
export function rankingLabel(federationId: string | undefined): string {
  return rankingRule(federationId).label
}

/** « 1731 pts » at the FFTT, « Classement 45 » at the AGR; « — » without a value. */
export function formatRanking(value: string | undefined, federationId: string | undefined): string {
  if (!value?.trim()) return '—'
  return federationId && federationId !== FFTT_FEDERATION_ID && RULES[federationId]
    ? `${rankingLabel(federationId)} ${value}`
    : `${value} pts`
}

/**
 * The same value where it repeats on every line — the match sheet (#735):
 * « 70 » at the AGR, the label being what pushed the player's name to an
 * ellipsis on a phone; « 1731 pts » at the FFTT, as everywhere.
 */
export function formatRankingShort(value: string | undefined, federationId: string | undefined): string {
  if (!value?.trim()) return '—'
  return federationId && federationId !== FFTT_FEDERATION_ID && RULES[federationId] ? value.trim() : `${value} pts`
}

const numeric = (v: string | undefined): number | undefined => {
  const n = Number(v?.trim())
  return v?.trim() && Number.isFinite(n) ? n : undefined
}

/**
 * Better ranked first, for a sort: negative when `a` ranks better than `b`.
 * Equal values compare equal — the AGR allows ties —, and a player with no
 * value comes after every player with one, whichever the direction.
 */
export function compareRanking(federationId: string | undefined, a: string | undefined, b: string | undefined): number {
  const x = numeric(a)
  const y = numeric(b)
  if (x === undefined || y === undefined) return Number(x === undefined) - Number(y === undefined)
  return rankingRule(federationId).lowerIsBetter ? x - y : y - x
}

/**
 * A member's current ranking in each federation of their club: the value
 * recorded for that federation's active phase (#645). Kembs's member may hold
 * both; Landser's holds the AGR's alone.
 */
export function currentRankings({
  playerId, federationIds, phases, rows,
}: {
  playerId: string | undefined
  federationIds: readonly string[]
  phases: Phase[]
  rows: PlayerPhasePoints[]
}): Array<{ federationId: string; label: string; value: string }> {
  return federationIds.flatMap((federationId) => {
    const value = pointsFor(rows, activePhaseOf(phases, federationId)?.id, playerId)
    return value ? [{ federationId, label: rankingLabel(federationId), value }] : []
  })
}
