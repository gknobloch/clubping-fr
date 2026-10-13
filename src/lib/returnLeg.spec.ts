import { describe, expect, it } from 'vitest'
import type { Division, Phase, Team } from '@/types'
import { nextPhaseOf, returnLegToPrepare } from './returnLeg'

// #649 — when Équipes offers « Préparer la phase retour ».

// One season for both federations (#645): the AGR's phases, the FFTT's beside them.
const phases: Phase[] = [
  { id: 'p1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active', federationId: 'agr' },
  { id: 'f2', seasonId: '27', name: 'Phase 2', displayName: '2026/2027 Phase 2', status: 'upcoming' },
  { id: 'p2', seasonId: '27', name: 'Phase 2', displayName: '2026/2027 Phase 2', status: 'upcoming', federationId: 'agr' },
  { id: 'q1', seasonId: '28', name: 'Phase 1', displayName: '2027/2028 Phase 1', status: 'upcoming', federationId: 'agr' },
]
const division = (secondPhase?: Division['secondPhase']): Division =>
  ({ id: 'd1', phaseId: 'p1', displayName: 'Prom. HONNEUR', rank: 1, playersPerGame: 4, isArchived: false, secondPhase })
const team = (over: Partial<Team> = {}): Team => ({
  id: 't1', clubId: 'landser', phaseId: 'p1', number: 2, divisionId: 'd1', groupId: 'g1',
  gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false, ...over,
} as Team)

describe('nextPhaseOf', () => {
  it('is the next number in the same season and federation — never the FFTT’s, never next season’s', () => {
    expect(nextPhaseOf(phases, phases[0])?.id).toBe('p2')
    expect(nextPhaseOf(phases, phases[2])).toBeUndefined()
  })
})

describe('returnLegToPrepare', () => {
  it('asks for a return-leg division whose phase 2 exists and does not hold the team yet', () => {
    expect(returnLegToPrepare(team(), { divisions: [division('return_leg')], phases, teams: [team()] })).toBe(true)
  })

  it('is quiet once mirrored, for new poules, and before phase 2 exists', () => {
    const mirrored = team({ id: 't2', phaseId: 'p2' })
    expect(returnLegToPrepare(team(), { divisions: [division('return_leg')], phases, teams: [team(), mirrored] })).toBe(false)
    expect(returnLegToPrepare(team(), { divisions: [division('new_groups')], phases, teams: [team()] })).toBe(false)
    expect(returnLegToPrepare(team(), { divisions: [division('return_leg')], phases: [phases[0], phases[1]], teams: [team()] })).toBe(false)
  })
})
