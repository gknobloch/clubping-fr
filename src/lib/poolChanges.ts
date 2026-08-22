// What an import must REMOVE, rather than add (#422).
//
// Every import path is additive: it creates what is missing and recognises
// what is already there. That breaks down when a poule is rebuilt mid-season
// — a forfait général upstream, repêchages, a calendar reissued with
// "ANNULE ET REMPLACE L'ÉDITION PRÉCÉDENTE". The affiches change, so nothing
// matches, and the new fixtures land next to the old ones: eight matches on a
// journée that has four, the same team playing twice the same week-end.
//
// This is the comparison the other direction, shared by the FFTT calendar
// import and the schedule-document import: given what a source states for a
// pool, which local games and which of the group's teams are no longer in it.
// Both callers resolve their own side to local ids first — that resolution is
// theirs (FFTT ids, club affiliation, OCR'd roster names), the set arithmetic
// below is not.

/** A local game as the comparison needs it. */
export interface ExistingGameRef {
  id: string
  matchDayId: string
  homeTeamId: string
  awayTeamId: string
  /** games.source — 'manual' means the slot was agreed by hand (#294). */
  source?: string | null
}

/** What the source states for one journée of the pool. */
export interface SourceRound {
  /** Local match_day id this round maps to. */
  matchDayId: string
  /** Pairings of the round, as local team ids. */
  pairings: Array<{ homeTeamId: string; awayTeamId: string }>
  /**
   * A match of this round could not be resolved to local teams (an
   * unreadable OCR line, an opponent the payload omits). The round is then
   * only partially known, so nothing is dropped from it — a match we failed
   * to read is not a match that disappeared.
   */
  incomplete?: boolean
}

/** Unordered: a fixture reversed home/away is the same fixture. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export interface ObsoleteGames {
  /** Ids of games the source no longer states, in the order given. */
  ids: string[]
  /** How many of those carry a slot agreed by hand (#294). */
  manual: number
}

/**
 * Games present locally that the source no longer states.
 *
 * Scoped to the journées the source itself covers: a round it says nothing
 * about is left untouched, whole. That is what makes this safe against a
 * partial source — a calendar the FFTT has only published up to J3, a
 * document holding one page — where treating silence as deletion would wipe
 * the rest of the season.
 *
 * A hand-agreed slot does NOT protect a game here: the comparison is on the
 * affiche, not on the date, and a fixture that is no longer in the poule is
 * gone whatever was negotiated for it. They are counted apart so the admin
 * confirms knowing what they lose.
 */
export function obsoleteGames(existing: ExistingGameRef[], rounds: SourceRound[]): ObsoleteGames {
  const wantedByMatchDay = new Map<string, Set<string>>()
  for (const round of rounds) {
    if (round.incomplete) continue
    const keys = wantedByMatchDay.get(round.matchDayId) ?? new Set<string>()
    for (const p of round.pairings) keys.add(pairKey(p.homeTeamId, p.awayTeamId))
    wantedByMatchDay.set(round.matchDayId, keys)
  }
  const ids: string[] = []
  let manual = 0
  for (const game of existing) {
    const wanted = wantedByMatchDay.get(game.matchDayId)
    if (!wanted) continue
    if (wanted.has(pairKey(game.homeTeamId, game.awayTeamId))) continue
    ids.push(game.id)
    if (game.source === 'manual') manual++
  }
  return { ids, manual }
}

/**
 * The teams a calendar states as playing — [] when any round could not be
 * fully read, since a poule half-read says nothing about who is still in it.
 */
export function playingTeamIds(rounds: SourceRound[]): string[] {
  if (rounds.some((r) => r.incomplete)) return []
  const playing = new Set<string>()
  for (const round of rounds) {
    for (const p of round.pairings) {
      playing.add(p.homeTeamId)
      playing.add(p.awayTeamId)
    }
  }
  return [...playing]
}

/**
 * Teams of the group the source no longer holds — the ones the repêchage
 * moved elsewhere. `sourceTeamIds` is the pool's composition as the source
 * states it: who plays its matches (see playingTeamIds), or, for a document,
 * its roster table.
 *
 * Only meaningful when the source covers the whole poule: an import scoped to
 * a single team (#287) sees three of eight opponents and would call the rest
 * departed. Callers must not run this in that mode.
 *
 * The team rows themselves are never deleted — an opponent may be a club that
 * uses the app, with its own roster and captain. Only the group's membership
 * is corrected; re-engaging the team elsewhere is its own club's business.
 */
export function departingTeamIds(groupTeamIds: string[], sourceTeamIds: string[]): string[] {
  // Nothing readable in the source: that is a parse failure, not an empty
  // poule. Emptying the group on it would be the worst possible reading.
  if (sourceTeamIds.length === 0) return []
  const playing = new Set(sourceTeamIds)
  return groupTeamIds.filter((id) => !playing.has(id))
}

/**
 * Match days left with no game at all once `deleted` are removed and
 * `created` are added. They go with their games — an empty journée is a shell
 * the UI would still list.
 */
export function emptiedMatchDayIds(
  existing: ExistingGameRef[],
  deletedGameIds: string[],
  createdGames: Array<{ matchDayId: string }>,
): string[] {
  const deleted = new Set(deletedGameIds)
  const remaining = new Map<string, number>()
  for (const g of existing) {
    remaining.set(g.matchDayId, (remaining.get(g.matchDayId) ?? 0) + (deleted.has(g.id) ? 0 : 1))
  }
  for (const g of createdGames) {
    if (remaining.has(g.matchDayId)) remaining.set(g.matchDayId, remaining.get(g.matchDayId)! + 1)
  }
  return [...remaining].flatMap(([id, count]) => (count === 0 ? [id] : []))
}
