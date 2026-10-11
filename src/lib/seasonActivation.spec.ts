import { describe, expect, it } from 'vitest'
import type { Phase, Season } from '@/types'
import { withActivePhase, withActiveSeason, withPhaseAlignedToSeason } from './seasonActivation'
import { activePhaseOf, federationOfPhase, phasesOfFederation } from './federations'
import { activeSeasonId, seasonIdFromName, seasonNumber } from './season'
import { phaseIdFor, phaseOrderKey } from './ffttPhases'

// #645 — ONE season for every federation, and one active phase in EACH: the
// AGR's phase 2 may start on another date than the FFTT's.

const seasons: Season[] = [
  { id: '26', displayName: '2025/2026', status: 'archived' },
  { id: '27', displayName: '2026/2027', status: 'active' },
]
const phase = (id: string, seasonId: string, name: string, status: Phase['status'], federationId?: string): Phase =>
  ({ id, seasonId, name, displayName: `${seasonId} ${name}`, status, ...(federationId ? { federationId } : {}) })
const phases: Phase[] = [
  phase('phase-27-1', '27', 'Phase 1', 'active'),
  phase('phase-27-2', '27', 'Phase 2', 'upcoming'),
  phase('phase-agr-27-1', '27', 'Phase 1', 'active', 'agr'),
  phase('phase-agr-27-2', '27', 'Phase 2', 'upcoming', 'agr'),
]
const statusOf = (list: Phase[]) => Object.fromEntries(list.map((p) => [p.id, p.status]))

describe('one season, phases per federation', () => {
  it('names a season once for everybody, and a phase by its federation', () => {
    expect(seasonIdFromName('2026/2027')).toBe('27')
    expect(phaseIdFor('fftt', '27', 1)).toBe('phase-27-1')
    expect(phaseIdFor('agr', '27', 1)).toBe('phase-agr-27-1')
    expect(seasonNumber('27')).toBe(27)
    expect(phaseOrderKey('27', 'Phase 2')).toBeGreaterThan(phaseOrderKey('27', 'Phase 1'))
  })

  it('has one active season, whatever the federation', () => {
    expect(activeSeasonId(seasons)).toBe('27')
  })

  it('files phases under their own federation', () => {
    expect(federationOfPhase(phases[2])).toBe('agr')
    expect(federationOfPhase(phases[0])).toBe('fftt')
    expect(phasesOfFederation(phases, 'fftt').map((p) => p.id)).toEqual(['phase-27-1', 'phase-27-2'])
    expect(activePhaseOf(phases)?.id).toBe('phase-27-1')
    expect(activePhaseOf(phases, 'agr')?.id).toBe('phase-agr-27-1')
  })
})

describe('activating a phase', () => {
  it('archives its own federation’s previous phase, and leaves the other federation alone', () => {
    expect(statusOf(withActivePhase(phases, 'phase-agr-27-2'))).toEqual({
      'phase-27-1': 'active',
      'phase-27-2': 'upcoming',
      'phase-agr-27-1': 'archived',
      'phase-agr-27-2': 'active',
    })
  })

  it('puts a newer phase back to upcoming on a rollback', () => {
    const later = withActivePhase(phases, 'phase-27-2')
    expect(statusOf(withActivePhase(later, 'phase-27-1'))['phase-27-2']).toBe('upcoming')
  })
})

describe('activating a season', () => {
  it('demotes the season that was active, for every federation', () => {
    const next = withActiveSeason([...seasons, { id: '28', displayName: '2027/2028', status: 'upcoming' }], '28')
    expect(Object.fromEntries(next.map((s) => [s.id, s.status]))).toEqual({ 26: 'archived', 27: 'archived', 28: 'active' })
  })

  it('moves each federation’s active phase onto the season, or leaves it with none', () => {
    const next = withPhaseAlignedToSeason(
      [...phases, phase('phase-agr-28-1', '28', 'Phase 1', 'upcoming', 'agr')], '28',
    )
    expect(statusOf(next)).toMatchObject({
      // The AGR has a phase in 2027/2028: it takes over.
      'phase-agr-27-1': 'archived', 'phase-agr-28-1': 'active',
      // The FFTT has none there yet: its phase steps down, none replaces it.
      'phase-27-1': 'archived',
    })
    expect(activePhaseOf(next)).toBeUndefined()
  })

  it('keeps a federation’s active phase that is already in the season', () => {
    expect(statusOf(withPhaseAlignedToSeason(phases, '27'))).toEqual(statusOf(phases))
  })
})
