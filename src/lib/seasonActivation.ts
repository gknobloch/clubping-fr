// What activating a season or a phase does to the others (#221, #227), per
// federation (#645).
//
// Shared domain logic — the web's DataContext applies it optimistically, and
// the API applies the same rule in SQL (`demoteActiveSeasons`,
// `demoteActivePhases`, `alignActivePhaseToSeason`). Keep this module free of
// any browser/RN/Node deps.
//
// One active season and one active phase IN EACH FEDERATION: the AGR's phase 2
// may start on another date than the FFTT's, so activating one federation's
// phase never touches the other's. What stops being active is archived when
// older than what becomes active, back to 'upcoming' when newer (a rollback).
// The active (season · phase) pair stays coherent: activating a phase
// activates its season, activating a season moves the phase onto it.
import type { Phase, Season } from '../types'
import { federationOfPhase, federationOfSeason } from './federations'
import { phaseOrderKey } from './ffttPhases'
import { seasonNumber } from './season'

type Seasons = Season[]
type Phases = Phase[]

const demotedSeason = (id: string, newId: string): Season['status'] =>
  seasonNumber(id) < seasonNumber(newId) ? 'archived' : 'upcoming'

const demotedPhase = (p: Phase, newKey: number): Phase['status'] =>
  phaseOrderKey(p.seasonId, p.name) < newKey ? 'archived' : 'upcoming'

/** The seasons once `seasonId` is active: its federation's other active season steps down. */
export function withActiveSeason(seasons: Seasons, seasonId: string): Seasons {
  const fed = federationOfSeason(seasons.find((s) => s.id === seasonId))
  return seasons.map((s) => {
    if (s.id === seasonId) return s.status === 'active' ? s : { ...s, status: 'active' }
    if (s.status !== 'active' || federationOfSeason(s) !== fed) return s
    return { ...s, status: demotedSeason(s.id, seasonId) }
  })
}

/** The phases once `phaseId` is active: its federation's other active phase steps down. */
export function withActivePhase(phases: Phases, seasons: Seasons, phaseId: string): Phases {
  const target = phases.find((p) => p.id === phaseId)
  if (!target) return phases
  const fed = federationOfPhase(target, seasons)
  const key = phaseOrderKey(target.seasonId, target.name)
  return phases.map((p) => {
    if (p.id === phaseId) return p.status === 'active' ? p : { ...p, status: 'active' }
    if (p.status !== 'active' || federationOfPhase(p, seasons) !== fed) return p
    return { ...p, status: demotedPhase(p, key) }
  })
}

/**
 * The phases once `seasonId` became active: its federation's active phase is
 * kept when it already belongs to that season, otherwise the season's most
 * recent phase that is not archived takes over (Phase 2 over Phase 1) — or
 * none, for a season with no phase yet.
 */
export function withPhaseAlignedToSeason(phases: Phases, seasons: Seasons, seasonId: string): Phases {
  const fed = federationOfSeason(seasons.find((s) => s.id === seasonId))
  const actives = phases.filter((p) => p.status === 'active' && federationOfPhase(p, seasons) === fed)
  if (actives.length > 0 && actives.every((p) => p.seasonId === seasonId)) return phases
  const latest = phases
    .filter((p) => p.seasonId === seasonId && p.status !== 'archived')
    .sort((a, b) => b.name.localeCompare(a.name))[0]
  const key = phaseOrderKey(seasonId, latest?.name ?? '')
  return phases.map((p) => {
    if (latest && p.id === latest.id) return { ...p, status: 'active' }
    if (p.status !== 'active' || federationOfPhase(p, seasons) !== fed) return p
    return { ...p, status: demotedPhase(p, key) }
  })
}
