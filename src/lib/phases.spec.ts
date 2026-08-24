import { describe, it, expect } from 'vitest'
import type { Phase } from '@/types'
import { orderPhases, defaultPhase } from './phases'

const phase = (id: string, displayName: string, status: Phase['status'] = 'archived'): Phase =>
  ({ id, seasonId: displayName.slice(0, 9), name: displayName.slice(10), displayName, status }) as Phase

// Deliberately not in chronological order: this is what the API can hand back.
const P26_1 = phase('phase-26-1', '2025/2026 Phase 1')
const P26_2 = phase('phase-26-2', '2025/2026 Phase 2')
const P27_1 = phase('phase-27-1', '2026/2027 Phase 1', 'active')

describe('orderPhases', () => {
  it('sorts oldest first, season then phase number', () => {
    expect(orderPhases([P27_1, P26_2, P26_1]).map((p) => p.displayName)).toEqual([
      '2025/2026 Phase 1',
      '2025/2026 Phase 2',
      '2026/2027 Phase 1',
    ])
  })

  it('leaves the array it was given alone', () => {
    const input = [P27_1, P26_1]
    orderPhases(input)
    expect(input.map((p) => p.id)).toEqual(['phase-27-1', 'phase-26-1'])
  })
})

describe('defaultPhase', () => {
  it('is the active phase, wherever it sits in the list', () => {
    expect(defaultPhase([P26_1, P27_1, P26_2])?.id).toBe('phase-27-1')
  })

  it('falls back to the most recent when no phase is active', () => {
    expect(defaultPhase([P26_1, P26_2])?.id).toBe('phase-26-2')
  })

  it('is undefined with no phases at all', () => {
    expect(defaultPhase([])).toBeUndefined()
  })
})
