import { describe, expect, it } from 'vitest'
import type { Game, MatchDay, Phase } from '@/types'
import { activeTeamOf } from './activeTeam'

// #711 — a member's team is theirs in the active phase of any federation.

const phases: Phase[] = [
  { id: 'phase-27-1', seasonId: '27', name: 'Phase 1', displayName: 'P1', status: 'active' },
  { id: 'phase-agr-27-1', seasonId: '27', name: 'Phase 1', displayName: 'P1', status: 'active', federationId: 'agr' },
  { id: 'phase-26-2', seasonId: '26', name: 'Phase 2', displayName: 'P2', status: 'archived' },
]
const team = (id: string, phaseId: string, playerIds: string[]) => ({ id, phaseId, playerIds })
const md = (id: string, date: string): MatchDay => ({ id, groupId: 'g', number: 1, date } as MatchDay)
const game = (id: string, teamId: string, matchDayId: string): Game =>
  ({ id, matchDayId, homeTeamId: teamId, awayTeamId: 'other' } as Game)

describe('activeTeamOf', () => {
  it('finds an AGR player’s team, which the FFTT’s active phase never holds', () => {
    const teams = [team('landser-1', 'phase-agr-27-1', ['nathan']), team('old', 'phase-26-2', ['nathan'])]
    expect(activeTeamOf('nathan', teams, phases, [], new Map(), '2026-10-12')?.id).toBe('landser-1')
    expect(activeTeamOf(undefined, teams, phases, [], new Map(), '2026-10-12')).toBeUndefined()
  })

  it('opens a member of both federations on the team that plays first, else on the FFTT’s', () => {
    const teams = [team('kembs-fftt', 'phase-27-1', ['kim']), team('kembs-agr', 'phase-agr-27-1', ['kim'])]
    const mds = new Map([['md-f', md('md-f', '2026-10-24')], ['md-a', md('md-a', '2026-10-16')]])
    const games = [game('gf', 'kembs-fftt', 'md-f'), game('ga', 'kembs-agr', 'md-a')]
    expect(activeTeamOf('kim', teams, phases, games, mds, '2026-10-12')?.id).toBe('kembs-agr')
    expect(activeTeamOf('kim', teams, phases, [], mds, '2026-10-12')?.id).toBe('kembs-fftt')
  })
})
