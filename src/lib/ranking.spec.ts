import { describe, expect, it } from 'vitest'
import type { Phase } from '@/types'
import { compareRanking, currentRankings, formatRanking, rankingLabel, rankingRule } from './ranking'

// #646 — the FFTT's points (higher is better) and the AGR's classement (lower is better).

describe('rankingRule', () => {
  it('names and orients each federation, the FFTT for an unknown one', () => {
    expect(rankingLabel('fftt')).toBe('Points')
    expect(rankingLabel('agr')).toBe('Classement')
    expect(rankingRule('agr').lowerIsBetter).toBe(true)
    expect(rankingRule('xyz')).toEqual(rankingRule('fftt'))
  })

  it('prints « 1731 pts » at the FFTT and « Classement 45 » at the AGR', () => {
    expect(formatRanking('1731', 'fftt')).toBe('1731 pts')
    expect(formatRanking('45', 'agr')).toBe('Classement 45')
    expect(formatRanking(undefined, 'agr')).toBe('—')
    expect(formatRanking('1731', undefined)).toBe('1731 pts')
  })
})

describe('compareRanking', () => {
  const sorted = (fed: string, values: Array<string | undefined>) => [...values].sort((a, b) => compareRanking(fed, a, b))

  it('puts the most points first at the FFTT', () => {
    expect(sorted('fftt', ['905', '1731', '1520'])).toEqual(['1731', '1520', '905'])
  })

  it('puts the lowest classement first at the AGR, ties kept equal', () => {
    expect(sorted('agr', ['45', '25', '80', '25'])).toEqual(['25', '25', '45', '80'])
    expect(compareRanking('agr', '25', '25')).toBe(0)
  })

  it('puts a player with no value last, in either direction', () => {
    expect(sorted('fftt', ['', '905'])).toEqual(['905', ''])
    expect(compareRanking('agr', undefined, '45')).toBeGreaterThan(0)
    expect(compareRanking('fftt', '905', undefined)).toBeLessThan(0)
    expect(compareRanking('agr', undefined, '')).toBe(0)
  })
})

describe('currentRankings', () => {
  const phases: Phase[] = [
    { id: 'phase-27-1', seasonId: '27', name: 'Phase 1', displayName: '', status: 'active' },
    { id: 'phase-agr-27-1', seasonId: '27', name: 'Phase 1', displayName: '', status: 'active', federationId: 'agr' },
  ]
  const rows = [
    { phaseId: 'phase-27-1', playerId: 'kembs', points: '1520' },
    { phaseId: 'phase-agr-27-1', playerId: 'kembs', points: '45' },
  ]

  it('gives a member of both federations both values, each with its label', () => {
    expect(currentRankings({ playerId: 'kembs', federationIds: ['fftt', 'agr'], phases, rows })).toEqual([
      { federationId: 'fftt', label: 'Points', value: '1520' },
      { federationId: 'agr', label: 'Classement', value: '45' },
    ])
  })

  it('gives a member of the AGR alone the classement alone', () => {
    expect(currentRankings({ playerId: 'kembs', federationIds: ['agr'], phases, rows }))
      .toEqual([{ federationId: 'agr', label: 'Classement', value: '45' }])
  })
})
