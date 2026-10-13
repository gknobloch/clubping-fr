// What activating a season or a phase does to the others (#221, #227, #645).
//
// Shared domain logic — the web's DataContext applies it optimistically, and
// the API applies the same rule in SQL (`demoteActiveSeasons`,
// `demoteActivePhases`, `alignActivePhasesToSeason`). Keep this module free of
// any browser/RN/Node deps.
//
// ONE active season, shared by every federation, and ONE active phase IN EACH
// FEDERATION: the AGR's phase 2 may start on another date than the FFTT's, so
// activating one federation's phase never touches the other's. What stops
// being active is archived when older than what becomes active, back to
// 'upcoming' when newer (a rollback). Every active phase sits in the active
// season: activating a phase activates its season, and activating a season
// moves each federation's active phase onto it.
import type { Phase, Season } from '../types'
import { federationOfPhase } from './federations'
import { phaseOrderKey } from './ffttPhases'
import { seasonNumber } from './season'

type Seasons = Season[]
type Phases = Phase[]

const demotedSeason = (id: string, newId: string): Season['status'] =>
  seasonNumber(id) < seasonNumber(newId) ? 'archived' : 'upcoming'

const demotedPhase = (p: Phase, newKey: number): Phase['status'] =>
  phaseOrderKey(p.seasonId, p.name) < newKey ? 'archived' : 'upcoming'

/** The seasons once `seasonId` is active: the other active season steps down. */
export function withActiveSeason(seasons: Seasons, seasonId: string): Seasons {
  return seasons.map((s) => {
    if (s.id === seasonId) return s.status === 'active' ? s : { ...s, status: 'active' }
    if (s.status !== 'active') return s
    return { ...s, status: demotedSeason(s.id, seasonId) }
  })
}

/** The phases once `phaseId` is active: its federation's other active phase steps down. */
export function withActivePhase(phases: Phases, phaseId: string): Phases {
  const target = phases.find((p) => p.id === phaseId)
  if (!target) return phases
  const fed = federationOfPhase(target)
  const key = phaseOrderKey(target.seasonId, target.name)
  return phases.map((p) => {
    if (p.id === phaseId) return p.status === 'active' ? p : { ...p, status: 'active' }
    if (p.status !== 'active' || federationOfPhase(p) !== fed) return p
    return { ...p, status: demotedPhase(p, key) }
  })
}

/**
 * The phases once `seasonId` became active, federation by federation: an
 * active phase already in that season is kept; otherwise the season's most
 * recent phase of that federation that is not archived takes over (Phase 2
 * over Phase 1) — or none, for a federation with no phase in it yet.
 */
export function withPhaseAlignedToSeason(phases: Phases, seasonId: string): Phases {
  const feds = [...new Set(phases.map(federationOfPhase))]
  let next = phases
  for (const fed of feds) {
    const actives = next.filter((p) => p.status === 'active' && federationOfPhase(p) === fed)
    if (actives.length > 0 && actives.every((p) => p.seasonId === seasonId)) continue
    const latest = next
      .filter((p) => p.seasonId === seasonId && federationOfPhase(p) === fed && p.status !== 'archived')
      .sort((a, b) => b.name.localeCompare(a.name))[0]
    const key = phaseOrderKey(seasonId, latest?.name ?? '')
    next = next.map((p) => {
      if (latest && p.id === latest.id) return { ...p, status: 'active' }
      if (p.status !== 'active' || federationOfPhase(p) !== fed) return p
      return { ...p, status: demotedPhase(p, key) }
    })
  }
  return next
}
