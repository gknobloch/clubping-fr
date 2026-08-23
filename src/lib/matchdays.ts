// Shared domain logic — imported by the web app (@/lib/matchdays) and the
// mobile app (@shared/lib/matchdays). Keep this module free of any
// browser/RN/Node deps.
import type { Team, Game, MatchDay, GameSelection, Division, Group } from '../types'
import { getMondayOf, getSundayOf, todayIso } from './weeks'

// Players already selected for another club team in the same journée (round
// number), mapped to that team's number — they can't be fielded twice the
// same match-day, so they're non-selectable for the current team.
export function playersCommittedElsewhere(
  currentTeamId: string,
  roundNumber: number,
  clubTeams: Team[],
  games: Game[],
  matchDays: MatchDay[],
  gameSelections: GameSelection[],
): Map<string, number> {
  const mdNumberById = new Map(matchDays.map((md) => [md.id, md.number]))
  const clubTeamById = new Map(clubTeams.map((t) => [t.id, t]))
  const result = new Map<string, number>()
  for (const sel of gameSelections) {
    if (sel.teamId === currentTeamId) continue
    const team = clubTeamById.get(sel.teamId)
    if (!team) continue
    const game = games.find((g) => g.id === sel.gameId)
    if (!game || mdNumberById.get(game.matchDayId) !== roundNumber) continue
    for (const pid of sel.playerIds) if (!result.has(pid)) result.set(pid, team.number)
  }
  return result
}

// Games own their date (#271); a match_day's date is derived server-side as
// the MIN of its games' dates. updateGame/addGame call the API fire-and-forget
// (no awaited response to sync from), so the optimistic client state needs
// its own mirror of that same derivation to avoid showing a stale date until
// the next full refetch.
export function deriveMatchDayDate(gamesForMatchDay: Game[], currentDate: string): string {
  const dates = gamesForMatchDay.map((g) => g.date).filter((d): d is string => !!d)
  return dates.length ? dates.sort()[0] : currentDate
}

/** A specific game's own date, falling back to its match day's (derived) date when unset. */
export const gameDate = (game: Game, matchDay: MatchDay): string => game.date ?? matchDay.date

/** Monday and Sunday (YYYY-MM-DD) of the ISO week containing `isoDate`. */
export function isoWeekRange(isoDate: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const backToMonday = (d.getUTCDay() + 6) % 7
  const start = new Date(d)
  start.setUTCDate(start.getUTCDate() - backToMonday)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/** How a game should be presented: a real slot, or only the journée's week. */
export interface GameSchedule {
  /** The date to show; null when only the week is known. */
  date: string | null
  /** The time to show; '' when unknown. Always the HOME team's, never the viewer's. */
  time: string
  /** Monday–Sunday of the journée, set only when `date` is null. */
  week: { start: string; end: string } | null
}

/**
 * When a game actually happens, as far as we can honestly say (#287).
 *
 * A fixture is only on a real date once the home club's playing day is known:
 * the FFTT calendar publishes a nominal weekend date, and the import moves a
 * home fixture back to that club's day. For an opponent auto-created by the
 * import we know neither its day nor its time, so its nominal date is a guess
 * — showing "dim. 8 nov. 19h30" claims a slot nobody confirmed, and the 19h30
 * was the *viewing* team's default, which has nothing to do with an away game.
 *
 * So: an explicit game date/time always wins. Otherwise, if the home team has
 * a default day, the stored date is real and its default time applies. Failing
 * that, only the journée's week is known.
 */
export function gameSchedule(
  game: Pick<Game, 'date' | 'time'> | undefined,
  matchDay: Pick<MatchDay, 'date'>,
  homeTeam: Pick<Team, 'defaultDay' | 'defaultTime'> | undefined,
): GameSchedule {
  // A game without its own date sits on the journée's — that has always been
  // the fallback, and it must stay one: requiring game.date would push every
  // manually created fixture into the "unconfirmed" branch.
  const date = game?.date ?? matchDay.date
  const time = game?.time || homeTeam?.defaultTime || ''
  if (game?.time) return { date, time, week: null }
  if (homeTeam?.defaultDay) return { date, time, week: null }
  return { date: null, time: '', week: isoWeekRange(date) }
}

/**
 * Just the time from `gameSchedule` — the one every screen needs and the only
 * part most of them show (#427).
 *
 * It is always the receiving club's: the game's own when it has one, else the
 * home team's default, and an empty string when that club's playing day is
 * unknown. Reach for this rather than `game.time`, which is silent about a
 * home fixture the club never gave an explicit hour, and which used to leave
 * two screens disagreeing about the same match.
 */
export function gameTime(
  game: Pick<Game, 'date' | 'time'> | undefined,
  matchDay: Pick<MatchDay, 'date'>,
  homeTeam: Pick<Team, 'defaultDay' | 'defaultTime'> | undefined,
): string {
  return gameSchedule(game, matchDay, homeTeam).time
}

// ---------------------------------------------------------------------------
// Journées across the club
//
// A "journée" is a round number, but each division stores its own MatchDay row
// for that round. Grouping them by number is what lets a screen speak of
// "Journée 6" as one thing across every team of the club. Moved here from the
// native app so web and native agree on what a journée is (#306).
// ---------------------------------------------------------------------------

export interface MatchDayGroup {
  number: number
  matchDays: MatchDay[]
  /** Earliest game date in the round (YYYY-MM-DD). */
  startDate: string
  /** Latest game date in the round. */
  endDate: string
}

/** A phase's match-days grouped by journée number, ordered by number. */
export function getPhaseMatchDays(
  phaseId: string,
  matchDays: MatchDay[],
  groups: Group[],
  divisions: Division[],
): MatchDayGroup[] {
  const divPhase = new Map(divisions.map((d) => [d.id, d.phaseId]))
  const groupToPhase = new Map<string, string>()
  for (const g of groups) {
    const ph = divPhase.get(g.divisionId)
    if (ph) groupToPhase.set(g.id, ph)
  }

  const byNumber = new Map<number, MatchDay[]>()
  for (const md of matchDays) {
    if (groupToPhase.get(md.groupId) !== phaseId) continue
    byNumber.set(md.number, [...(byNumber.get(md.number) ?? []), md])
  }

  return [...byNumber.entries()]
    .map(([number, mds]) => {
      const dates = mds.map((m) => m.date).sort()
      return { number, matchDays: mds, startDate: dates[0], endDate: dates[dates.length - 1] }
    })
    .sort((a, b) => a.number - b.number)
}

/**
 * The "active" journée: the first whose games haven't fully passed, with a
 * weekend tolerance — a Saturday round stays active through the following
 * Sunday, so a club looking at the app on Sunday morning still lands on
 * yesterday's round. Falls back to the last journée when every one is past.
 */
export function activeMatchDayNumber(matchDayGroups: MatchDayGroup[]): number | null {
  if (matchDayGroups.length === 0) return null
  const today = todayIso()
  for (const g of matchDayGroups) {
    const effectiveEnd = getSundayOf(getMondayOf(g.endDate))
    if (today <= effectiveEnd) return g.number
  }
  return matchDayGroups[matchDayGroups.length - 1].number
}

/** Date-range label, e.g. "sam. 27 oct." or "sam. 27 – dim. 28 oct.". */
export function formatMatchDayRange(startDate: string, endDate: string): string {
  const fmt = (d: string, withMonth: boolean) =>
    new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
    })
  return startDate === endDate ? fmt(startDate, true) : `${fmt(startDate, false)} – ${fmt(endDate, true)}`
}
