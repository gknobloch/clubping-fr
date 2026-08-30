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
 * Whether a fixture sits on a date anyone has confirmed (#429).
 *
 * False for the FFTT's nominal week-end date at a club whose playing day we
 * don't know — an opponent the import created. Every screen that prints that
 * date should mark it, and none should offer to put it in a calendar.
 */
export function isSlotConfirmed(
  game: Pick<Game, 'date' | 'time'> | undefined,
  matchDay: Pick<MatchDay, 'date'>,
  homeTeam: Pick<Team, 'defaultDay' | 'defaultTime'> | undefined,
): boolean {
  return gameSchedule(game, matchDay, homeTeam).date !== null
}

/** What to tell someone hovering an unconfirmed date, in both apps. */
export const UNCONFIRMED_SLOT_HINT =
  'Date et heure non confirmées : le jour de jeu du club recevant n’est pas connu.'

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

/**
 * Whose matches a round's dates describe. Without it a journée spans every
 * poule of the phase, at the poule's own date — two steps away from what the
 * Journées screen lists, which is the club's teams at each game's own date
 * (#450). One badly dated round in a poule the club has no team in was enough
 * to stretch the header over half a season, and to keep that journée "active"
 * for months.
 */
export interface MatchDayScope {
  games: Game[]
  teamIds: Iterable<string>
}

/** A phase's match-days grouped by journée number, ordered by number. */
export function getPhaseMatchDays(
  phaseId: string,
  matchDays: MatchDay[],
  groups: Group[],
  divisions: Division[],
  scope?: MatchDayScope,
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

  // Dates of the scoped teams' own games, per match-day.
  const scopedDates = new Map<string, string[]>()
  if (scope) {
    const teamIds = new Set(scope.teamIds)
    const mdById = new Map(matchDays.map((m) => [m.id, m]))
    for (const g of scope.games) {
      if (!teamIds.has(g.homeTeamId) && !teamIds.has(g.awayTeamId)) continue
      const md = mdById.get(g.matchDayId)
      if (!md) continue
      scopedDates.set(md.id, [...(scopedDates.get(md.id) ?? []), gameDate(g, md)])
    }
  }

  return [...byNumber.entries()]
    .map(([number, mds]) => {
      // A round the club sits out has no game to speak for it, so its poules'
      // dates stand in — the screen says "aucun match" under them anyway.
      const scoped = mds.flatMap((m) => scopedDates.get(m.id) ?? [])
      const dates = (scoped.length ? scoped : mds.map((m) => m.date)).sort()
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

/**
 * Date-range label, e.g. "sam. 27 oct." or "sam. 27 – dim. 28 oct.".
 *
 * The month is dropped from the start only when both ends share it: across
 * two months, "mar. 13 – sam. 18 mai" reads as 13 to 18 May (#450).
 */
export function formatMatchDayRange(startDate: string, endDate: string): string {
  const fmt = (d: string, withMonth: boolean) =>
    new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
    })
  if (startDate === endDate) return fmt(startDate, true)
  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7)
  return `${fmt(startDate, !sameMonth)} – ${fmt(endDate, true)}`
}

/**
 * The journées an admin's home screen should list next, and how many matches
 * each holds *for them* (#474).
 *
 * The screen used to take every journée in the database and count every game
 * in it. For a general admin that reads correctly — they oversee the lot — but
 * a club admin was shown other clubs' fixtures as though they were their own.
 * The onboarding flow is what made that visible: it creates club admins for
 * clubs with nothing in them yet, and this is the first screen they see, so a
 * brand-new club with no team announced three journées and twelve matches.
 *
 * The scope is stated, never inferred from whether a club id happens to be
 * present. Inferring it once cost a general admin their whole list: a stray
 * `club_id` of the literal string 'NULL' read as a club, and scoped them to one
 * that does not exist. Who sees everything is a question about a role, so the
 * caller answers it.
 */
export function upcomingMatchDays<
  M extends { id: string; date: string },
  G extends { matchDayId: string; homeTeamId: string; awayTeamId: string },
  T extends { id: string; clubId: string },
>(
  matchDays: M[],
  games: G[],
  teams: T[],
  {
    scope,
    today,
    limit = 3,
  }: { scope: 'all' | { clubId: string }; today: string; limit?: number },
): { matchDay: M; games: number }[] {
  const mine =
    scope === 'all'
      ? null
      : new Set(teams.filter((t) => t.clubId === scope.clubId).map((t) => t.id))
  const counts = new Map<string, number>()
  for (const g of games) {
    if (mine && !mine.has(g.homeTeamId) && !mine.has(g.awayTeamId)) continue
    counts.set(g.matchDayId, (counts.get(g.matchDayId) ?? 0) + 1)
  }
  return matchDays
    .filter((md) => md.date >= today)
    // A journée the club does not play in is not their journée. Without a club
    // scope every journée counts, including one with no games recorded yet.
    .filter((md) => !mine || counts.has(md.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((md) => ({ matchDay: md, games: counts.get(md.id) ?? 0 }))
}
