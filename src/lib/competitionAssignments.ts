// Who is already playing under a competition (#482).
//
// Eligibility restricts what can be *added* — a roster picker, a line-up's
// "autres joueurs" — and deliberately never erases what exists: a competition
// edited after the fact must not empty a squad. That rule is what makes editing
// safe, and it is also what makes it quiet. Excluding someone who is already in
// an équipe leaves them there, playing, while the club's own screen says they
// are not eligible.
//
// So the contradiction has to be visible. This module answers "what would this
// exclusion contradict?", and the screens print the answer beside the verdict
// and in the confirmation before creating one.

import type { Competition, Division, GameSelection, Team } from '../types'
import { competitionOfDivision } from './competitionEligibility'

export interface CompetitionAssignment {
  /** Team numbers whose roster holds them, ascending. */
  teamNumbers: number[]
  /** How many line-ups name them — one per (rencontre, équipe). */
  lineups: number
}

/**
 * Everyone already engaged in `competitionId`, by player id.
 *
 * Computed once per competition rather than once per cell: the grid asks this
 * of forty players against five competitions, and the roster scan is the same
 * scan every time.
 *
 * A team belongs to a competition through its division — never directly — so
 * this reads `competitionOfDivision`, which also drops a division filed under
 * an archived competition. Archived teams are ignored: a squad from a finished
 * phase is history, not an engagement.
 */
export function assignmentsByPlayer(
  competitionId: string,
  ctx: {
    teams: Team[]
    divisions: Division[]
    competitions: Competition[]
    gameSelections: GameSelection[]
  },
): Map<string, CompetitionAssignment> {
  const here = ctx.teams.filter(
    (t) => !t.isArchived
      && competitionOfDivision(t.divisionId, ctx.divisions, ctx.competitions)?.id === competitionId,
  )
  if (here.length === 0) return new Map()

  const byTeam = new Map(here.map((t) => [t.id, t]))
  const out = new Map<string, CompetitionAssignment>()
  const entry = (playerId: string) => {
    let e = out.get(playerId)
    if (!e) out.set(playerId, (e = { teamNumbers: [], lineups: 0 }))
    return e
  }

  for (const team of here) {
    for (const playerId of team.playerIds) {
      const e = entry(playerId)
      if (!e.teamNumbers.includes(team.number)) e.teamNumbers.push(team.number)
    }
  }
  for (const selection of ctx.gameSelections) {
    if (!byTeam.has(selection.teamId)) continue
    for (const playerId of selection.playerIds) entry(playerId).lineups += 1
  }

  for (const e of out.values()) e.teamNumbers.sort((a, b) => a - b)
  return out
}

/** "3 et 6" — the French list, so the sentences below read as sentences. */
function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

/**
 * What that engagement reads as, or null when there is none.
 *
 * Deliberately states the fact rather than a consequence: nothing is undone by
 * an exclusion, so "sera retiré" would be a lie. What the club is told is what
 * it will have to reconcile itself.
 */
export function assignmentSummary(assignment: CompetitionAssignment | undefined): string | null {
  if (!assignment) return null
  const { teamNumbers, lineups } = assignment
  const parts: string[] = []
  if (teamNumbers.length === 1) parts.push(`dans l'équipe ${teamNumbers[0]}`)
  else if (teamNumbers.length > 1) parts.push(`dans les équipes ${joinFr(teamNumbers.map(String))}`)
  if (lineups === 1) parts.push('aligné sur 1 rencontre')
  else if (lineups > 1) parts.push(`aligné sur ${lineups} rencontres`)
  if (parts.length === 0) return null
  return `Déjà ${joinFr(parts)}`
}
