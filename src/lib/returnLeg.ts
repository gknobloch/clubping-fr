import type { Division, Phase, Team } from '@/types'

/**
 * Phase retour (#649) — what the screens need to offer preparing one. The
 * mirror itself is the API's (`POST /groups/:id/return-leg`), which asks the
 * same questions of the rows.
 */

/** The number in a phase's name: « Phase 2 » → 2. */
const phaseNumber = (p: Pick<Phase, 'name'>) => Number(/(\d+)/.exec(p.name)?.[1])

/** The phase after this one in its season — « Phase 2 » after « Phase 1 ». */
export function nextPhaseOf(phases: readonly Phase[], phase: Phase | undefined): Phase | undefined {
  const n = phase ? phaseNumber(phase) : NaN
  if (!phase || !Number.isInteger(n)) return undefined
  return phases.find((p) => p.seasonId === phase.seasonId && phaseNumber(p) === n + 1)
}

/**
 * Whether this team's poule has a return leg still to prepare: its division
 * plays phase 2 as one, phase 2 exists, and the team is not in it yet. Once
 * the poule is mirrored the action disappears — and it is normally mirrored
 * without anyone asking, at the import or when phase 2 is created.
 */
export function returnLegToPrepare(
  team: Team,
  ctx: { divisions: readonly Division[]; phases: readonly Phase[]; teams: readonly Team[] },
): boolean {
  if (!team.groupId || team.isArchived) return false
  const division = ctx.divisions.find((d) => d.id === team.divisionId)
  if (division?.secondPhase !== 'return_leg') return false
  const next = nextPhaseOf(ctx.phases, ctx.phases.find((p) => p.id === team.phaseId))
  if (!next) return false
  return !ctx.teams.some((t) => t.phaseId === next.id && t.clubId === team.clubId && t.number === team.number)
}
