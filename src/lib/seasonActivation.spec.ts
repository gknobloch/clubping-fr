import { describe, expect, it } from 'vitest'
import type { Phase, Season } from '@/types'
import { withActivePhase, withActiveSeason, withPhaseAlignedToSeason } from './seasonActivation'
import { activePhaseOf, federationOfPhase, phasesOfFederation } from './federations'
import { activeSeasonId, seasonIdFromName, seasonNumber } from './season'
import { phaseOrderKey } from './ffttPhases'

// #645 — one active season and phase in EACH federation: the AGR's phase 2
// may start on another date than the FFTT's.

const seasons: Season[] = [
  { id: '26', displayName: '2025/2026', status: 'archived' },
  { id: '27', displayName: '2026/2027', status: 'active' },
  { id: 'agr-27', displayName: '2026/2027', status: 'active', federationId: 'agr' },
]
const phase = (id: string, seasonId: string, name: string, status: Phase['status']): Phase =>
  ({ id, seasonId, name, displayName: `${seasonId} ${name}`, status })
const phases: Phase[] = [
  phase('phase-27-1', '27', 'Phase 1', 'active'),
  phase('phase-27-2', '27', 'Phase 2', 'upcoming'),
  phase('phase-agr-27-1', 'agr-27', 'Phase 1', 'active'),
  phase('phase-agr-27-2', 'agr-27', 'Phase 2', 'upcoming'),
]
const statusOf = (list: Phase[]) => Object.fromEntries(list.map((p) => [p.id, p.status]))

describe('season ids per federation', () => {
  it('keeps the FFTT id, and prefixes another federation’s', () => {
    expect(seasonIdFromName('2026/2027')).toBe('27')
    expect(seasonIdFromName('2026/2027', 'agr')).toBe('agr-27')
    expect(seasonNumber('agr-27')).toBe(27)
    expect(phaseOrderKey('agr-27', 'Phase 2')).toBe(phaseOrderKey('27', 'Phase 2'))
  })

  it('reads the active season of the FFTT unless asked for another', () => {
    expect(activeSeasonId(seasons)).toBe('27')
    expect(activeSeasonId(seasons, 'agr')).toBe('agr-27')
  })

  it('files phases under their season’s federation', () => {
    expect(federationOfPhase(phases[2], seasons)).toBe('agr')
    expect(phasesOfFederation(phases, seasons, 'fftt').map((p) => p.id)).toEqual(['phase-27-1', 'phase-27-2'])
    expect(activePhaseOf(phases, seasons)?.id).toBe('phase-27-1')
    expect(activePhaseOf(phases, seasons, 'agr')?.id).toBe('phase-agr-27-1')
  })
})

describe('activating a phase', () => {
  it('archives its own federation’s previous phase, and leaves the other federation alone', () => {
    expect(statusOf(withActivePhase(phases, seasons, 'phase-agr-27-2'))).toEqual({
      'phase-27-1': 'active',
      'phase-27-2': 'upcoming',
      'phase-agr-27-1': 'archived',
      'phase-agr-27-2': 'active',
    })
  })

  it('puts a newer phase back to upcoming on a rollback', () => {
    const later = withActivePhase(phases, seasons, 'phase-27-2')
    expect(statusOf(withActivePhase(later, seasons, 'phase-27-1'))['phase-27-2']).toBe('upcoming')
  })
})

describe('activating a season', () => {
  it('demotes its own federation’s active season only', () => {
    const next = withActiveSeason([...seasons, { id: '28', displayName: '2027/2028', status: 'upcoming' }], '28')
    expect(Object.fromEntries(next.map((s) => [s.id, s.status]))).toEqual({
      26: 'archived', 27: 'archived', 28: 'active', 'agr-27': 'active',
    })
  })

  it('moves the active phase onto the season, in its federation only', () => {
    const withAgr28: Season[] = [...seasons, { id: 'agr-28', displayName: '2027/2028', status: 'active', federationId: 'agr' }]
    const next = withPhaseAlignedToSeason(
      [...phases, phase('phase-agr-28-1', 'agr-28', 'Phase 1', 'upcoming')], withAgr28, 'agr-28',
    )
    expect(statusOf(next)).toMatchObject({
      'phase-27-1': 'active', 'phase-agr-27-1': 'archived', 'phase-agr-28-1': 'active',
    })
  })
})
