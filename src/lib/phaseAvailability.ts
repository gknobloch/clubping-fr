import { gameDate } from './matchdays'
import { sortByName } from './sortByName'
import type { GameWithMatchDay } from './teamPhases'
import type {
  AvailabilityStatus, Division, Game, GameAvailability, GameSelection, Group, Player, Team,
} from '../types'

// ---------------------------------------------------------------------------
// Les disponibilités de toute une phase, pour une équipe (#623)
//
// The journées matrix answers «qui est dispo sur les trois prochaines
// journées», for every team at once. A captain planning a phase asks the other
// question: for *my* team, who can play how much of it — «5/7» per player, the
// whole phase on one screen. Same answers, read along the other axis.
//
// This is the only derivation of that grid; the web's team page and the app's
// screen both draw it, so «5/7» is the same number on both.
// ---------------------------------------------------------------------------

/** One cell: what the player answered for one match, and whether the line-up names them. */
export interface PhaseAvailabilityCell {
  gameId: string
  /** Absent = no answer — the absence of a row, as everywhere else (#495). */
  status?: AvailabilityStatus
  selected: boolean
}

export interface PhaseAvailabilityRow {
  player: Player
  /** One per match, in the order of `games`. */
  cells: PhaseAvailabilityCell[]
  /** Matches answered «Oui» — the numerator of «5/7». */
  available: number
  /** Matches whose line-up names them — the numerator of the «Sél.» column. */
  selected: number
}

/** A renfort a line-up names, and what they answered for that match. */
export interface PhaseRenfort {
  player: Player
  status?: AvailabilityStatus
}

export interface PhaseAvailabilityGrid {
  /** The roster, by name. */
  rows: PhaseAvailabilityRow[]
  /**
   * Per match, the renforts its line-up names — players from outside the
   * roster, by name. One row for all of them, not a row each: a phase can
   * borrow five different players once, and five rows of one frame each would
   * push the roster's own totals off a phone held sideways.
   */
  renforts: PhaseRenfort[][]
  /** Matches that borrowed anyone — the «Sél.» of the Renforts row. */
  renfortGames: number
  /**
   * Per match, how many of the roster answered «Oui» — the roster, as in the
   * journées matrix's Résumé (#580): a renfort's yes is not the team's pool.
   */
  availableByGame: number[]
  /** Per match, how many the line-up names — renforts included. */
  selectedByGame: number[]
}

/**
 * Lignes = the roster; colonnes = `games`, in the order given (the caller's
 * `teamPhaseEntries`, by date); and per match, the renforts its line-up
 * borrowed. The denominator of a row's ratio is `games.length`: a match the
 * player did not answer is a match they have not said yes to.
 */
export function phaseAvailabilityGrid(
  team: { id: string; playerIds: string[] },
  games: Pick<Game, 'id'>[],
  players: Player[],
  gameAvailabilities: GameAvailability[],
  gameSelections: GameSelection[],
): PhaseAvailabilityGrid {
  const gameIds = new Set(games.map((g) => g.id))

  const selectedIn = new Map<string, Set<string>>()
  for (const sel of gameSelections) {
    if (sel.teamId !== team.id || !gameIds.has(sel.gameId)) continue
    selectedIn.set(sel.gameId, new Set(sel.playerIds))
  }

  const statusOf = new Map<string, AvailabilityStatus>()
  for (const a of gameAvailabilities) {
    if (gameIds.has(a.gameId)) statusOf.set(`${a.gameId}:${a.playerId}`, a.status)
  }

  const byId = new Map(players.map((p) => [p.id, p]))
  const rosterIds = new Set(team.playerIds)
  const resolve = (ids: Iterable<string>) =>
    sortByName([...ids].map((id) => byId.get(id)).filter((p): p is Player => !!p))

  const rows = resolve(rosterIds).map((player): PhaseAvailabilityRow => {
    const cells = games.map((g) => ({
      gameId: g.id,
      status: statusOf.get(`${g.id}:${player.id}`),
      selected: selectedIn.get(g.id)?.has(player.id) ?? false,
    }))
    return {
      player,
      cells,
      available: cells.filter((c) => c.status === 'available').length,
      selected: cells.filter((c) => c.selected).length,
    }
  })

  const renforts = games.map((g) =>
    resolve([...(selectedIn.get(g.id) ?? [])].filter((pid) => !rosterIds.has(pid))).map((player) => ({
      player,
      status: statusOf.get(`${g.id}:${player.id}`),
    })),
  )

  return {
    rows,
    renforts,
    renfortGames: renforts.filter((r) => r.length > 0).length,
    availableByGame: games.map((_, i) => rows.filter((r) => r.cells[i].status === 'available').length),
    selectedByGame: games.map((g) => selectedIn.get(g.id)?.size ?? 0),
  }
}

/** One column header: «J3», and the match's own date under it. */
export interface PhaseAvailabilityColumn {
  gameId: string
  number: number
  /** «12/9» — day and month, all a header has room for. */
  date: string
}

export function phaseAvailabilityColumns(games: GameWithMatchDay[]): PhaseAvailabilityColumn[] {
  return games.map((g) => {
    const [, m, d] = (g.matchDay ? gameDate(g, g.matchDay) : '').split('-')
    return {
      gameId: g.id,
      number: g.matchDay?.number ?? 0,
      date: d && m ? `${Number(d)}/${Number(m)}` : '',
    }
  })
}

/**
 * Players the team's division fields per match — the bar the «Disponibles»
 * count is read against. Four when the division does not say, as in the
 * journées matrix.
 */
export function playersRequired(
  team: Pick<Team, 'groupId'> | undefined,
  groups: Group[],
  divisions: Division[],
): number {
  const group = groups.find((g) => g.id === team?.groupId)
  return (group ? divisions.find((d) => d.id === group.divisionId)?.playersPerGame : undefined) ?? 4
}

/**
 * The «Sélectionnés» total for one match, read against the division's count.
 *
 * A line-up is an exact count, as in the journées matrix (#580): 3/4 and 5/4
 * are both wrong. But an empty one is not — across a whole phase, the matches
 * nobody has composed yet are most of them, and seven red zeros would say
 * «error» about a captain who has simply not got there.
 */
export function selectionVerdict(selected: number, required: number): 'empty' | 'ok' | 'off' {
  if (selected === 0) return 'empty'
  return selected === required ? 'ok' : 'off'
}

/** The grid of a team with nothing to show — before a calendar, say. */
export const EMPTY_PHASE_GRID: PhaseAvailabilityGrid = {
  rows: [],
  renforts: [],
  renfortGames: 0,
  availableByGame: [],
  selectedByGame: [],
}
