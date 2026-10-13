// The feuille de match's letters and placement, per federation (#383, #650).
//
// Shared domain logic — imported by the web app (@/lib/matchSheet) and the
// mobile app (@shared/lib/matchSheet). Keep this module free of any
// browser/RN/Node deps.
//
// The FFTT: A, B, C, D at home and W, X, Y, Z away — the visitors' letters end
// at Z, so three players are X, Y, Z —, in any order.
//
// The AGR: both sides start from a fixed letter — A, B, C(, D) at home and
// U, V, W(, X) away — and, four a side, the best ranked (or one of them, the
// AGR allows ties) plays A at home and V away: the SECOND line away, not the
// first. Three a side (Division 2), the order is free.
//
// The sheet is an aid for copying onto paper; nothing here is written. What
// it must not do is let a captain copy a placement the AGR refuses.
import { compareRanking } from './ranking'

export type SheetSide = 'home' | 'away'

interface SheetRule {
  /** The away side's first letter; undefined ends the set at Z (the FFTT). */
  awayFrom?: string
  /** Four a side: the line the best ranked must hold, per side. */
  bestAt?: { home: number; away: number; playersPerSide: number }
}

const FFTT_RULE: SheetRule = {}
const RULES: Record<string, SheetRule> = {
  agr: { awayFrom: 'U', bestAt: { home: 0, away: 1, playersPerSide: 4 } },
}

const ruleOf = (federationId: string | undefined) => (federationId && RULES[federationId]) || FFTT_RULE

/** The letters of `n` lines on one side. */
export function sheetLetters(federationId: string | undefined, n: number, side: SheetSide): string[] {
  const from = side === 'home'
    ? 65
    : ruleOf(federationId).awayFrom?.charCodeAt(0) ?? 90 - n + 1
  return Array.from({ length: n }, (_, i) => String.fromCharCode(from + i))
}

/** The line only a best-ranked player may hold, or null where the order is free. */
export function reservedLine(federationId: string | undefined, n: number, side: SheetSide): number | null {
  const best = ruleOf(federationId).bestAt
  return best && n === best.playersPerSide ? best[side] : null
}

interface Ranked { points?: string }

/** The best ranking in the line-up — what the reserved line asks for. */
function bestRanking<T extends Ranked>(federationId: string | undefined, players: readonly T[]): string | undefined {
  return [...players].sort((a, b) => compareRanking(federationId, a.points, b.points))[0]?.points
}

const isBest = <T extends Ranked>(federationId: string | undefined, players: readonly T[], p: T | undefined) =>
  !!p && compareRanking(federationId, p.points, bestRanking(federationId, players)) === 0

/**
 * The order the sheet opens on: the line-up as given, with a best-ranked
 * player moved to the reserved line if it does not hold one already. Nobody
 * else moves but the one swapped out.
 */
export function placeBestRanked<T extends Ranked>(order: readonly T[], federationId: string | undefined, side: SheetSide): T[] {
  const line = reservedLine(federationId, order.length, side)
  const next = order.slice()
  if (line === null || isBest(federationId, order, order[line])) return next
  const from = next.findIndex((p) => isBest(federationId, order, p))
  if (from < 0) return next
  ;[next[line], next[from]] = [next[from], next[line]]
  return next
}

/**
 * Why this order cannot be copied onto the sheet — the reserved line holds a
 * player who is not the best ranked —, or null when it can.
 */
export function sheetOrderRefusal<T extends Ranked>(
  order: readonly T[], federationId: string | undefined, side: SheetSide,
): string | null {
  const line = reservedLine(federationId, order.length, side)
  if (line === null || isBest(federationId, order, order[line])) return null
  const letter = sheetLetters(federationId, order.length, side)[line]
  const best = bestRanking(federationId, order)
  return `En ${letter}, le mieux classé de l’équipe${best ? ` (classement ${best})` : ''} : c’est la règle de l’AGR.`
}

/** What the sheet says under the line-up when a line is reserved. */
export function reservedLineNote(federationId: string | undefined, n: number): string | null {
  const best = ruleOf(federationId).bestAt
  if (!best || n !== best.playersPerSide) return null
  return `Le mieux classé joue en ${sheetLetters(federationId, n, 'home')[best.home]} à domicile, `
    + `en ${sheetLetters(federationId, n, 'away')[best.away]} à l’extérieur.`
}
