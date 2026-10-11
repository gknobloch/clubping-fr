import { describe, expect, it } from 'vitest'
import type { Club, Phase } from '@/types'
import { phaseScope } from './phaseScope'

// #645 — the federation first, then its phases.

const federations = [{ id: 'fftt' }, { id: 'agr' }]
// One season, 2026/2027: each federation's phases in it (#645).
const phase = (id: string, seasonId: string, name: string, status: Phase['status'], federationId?: string): Phase =>
  ({ id, seasonId, name, displayName: `2026/2027 ${name}`, status, ...(federationId ? { federationId } : {}) })
const phases = [
  phase('phase-27-2', '27', 'Phase 2', 'upcoming'),
  phase('phase-27-1', '27', 'Phase 1', 'active'),
  phase('phase-agr-27-1', '27', 'Phase 1', 'archived', 'agr'),
  phase('phase-agr-27-2', '27', 'Phase 2', 'active', 'agr'),
]
const club = (over: Partial<Club>): Club =>
  ({ id: 'c', affiliationNumber: '', displayName: 'C', isArchived: false, addresses: [], channels: [], ...over })
const kembs = club({ affiliationNumber: '06680140', affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }] })
const landser = club({ affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] })

describe('phaseScope', () => {
  it('opens a club of both on the FFTT, its phases in order, its active one first', () => {
    const scope = phaseScope({ federations, phases, club: kembs })
    expect(scope.options.map((f) => f.id)).toEqual(['fftt', 'agr'])
    expect(scope.phases.map((p) => p.id)).toEqual(['phase-27-1', 'phase-27-2'])
    expect(scope.defaultPhase?.id).toBe('phase-27-1')
  })

  it('pages through the AGR’s own phases once chosen — its phase 2 active on its own date', () => {
    const scope = phaseScope({ federations, phases, club: kembs, chosen: 'agr' })
    expect(scope.phases.map((p) => p.id)).toEqual(['phase-agr-27-1', 'phase-agr-27-2'])
    expect(scope.defaultPhase?.id).toBe('phase-agr-27-2')
  })

  it('never offers a club a federation it is not in — Landser is the AGR alone', () => {
    const scope = phaseScope({ federations, phases, club: landser, chosen: 'fftt' })
    expect(scope.options.map((f) => f.id)).toEqual(['agr'])
    expect(scope.federationId).toBe('agr')
  })

  it('offers a general admin every federation', () => {
    expect(phaseScope({ federations, phases }).options).toHaveLength(2)
  })
})
