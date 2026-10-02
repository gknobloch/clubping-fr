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
  /** Fielded by this team without being on its roster. */
  renfort: boolean
  /** One per match, in the order of `games`. */
  cells: PhaseAvailabilityCell[]
  /** Matches answered «Oui» — the numerator of «5/7». */
  available: number
  /** Matches whose line-up names them — the numerator of the «Sél.» column. */
  selected: number
}

export interface PhaseAvailabilityGrid {
  rows: PhaseAvailabilityRow[]
  /** Per match, how many of the rows answered «Oui». */
  availableByGame: number[]
  /**
   * Per match, how many the line-up names — the line-up itself, not a count
   * of the rows, though every name on it is a row (a renfort is one).
   */
  selectedByGame: number[]
}

/**
 * Lignes = the roster, then any renfort a line-up of this phase already names;
 * colonnes = `games`, in the order given (the caller's `teamPhaseEntries`, by
 * date). The denominator of a row's ratio is `games.length`: a match the
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
  const renfortIds = new Set<string>()
  for (const ids of selectedIn.values()) {
    for (const pid of ids) if (!rosterIds.has(pid)) renfortIds.add(pid)
  }

  const resolve = (ids: Iterable<string>) =>
    sortByName([...ids].map((id) => byId.get(id)).filter((p): p is Player => !!p))

  const rowOf = (player: Player, renfort: boolean): PhaseAvailabilityRow => {
    const cells = games.map((g) => ({
      gameId: g.id,
      status: statusOf.get(`${g.id}:${player.id}`),
      selected: selectedIn.get(g.id)?.has(player.id) ?? false,
    }))
    return {
      player,
      renfort,
      cells,
      available: cells.filter((c) => c.status === 'available').length,
      selected: cells.filter((c) => c.selected).length,
    }
  }

  const rows = [
    ...resolve(rosterIds).map((p) => rowOf(p, false)),
    ...resolve(renfortIds).map((p) => rowOf(p, true)),
  ]

  return {
    rows,
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
