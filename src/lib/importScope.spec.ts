import { describe, expect, it } from 'vitest'
import { importableGroupIds } from './importScope'
import type { Division, Group, Team } from '@/types'

const divisions = [
  { id: 'd1', phaseId: 'phase-27-1', displayName: 'GE 6', rank: 1, playersPerGame: 4, isArchived: false },
  { id: 'd2', phaseId: 'phase-27-1', displayName: 'Nationale 3', rank: 2, playersPerGame: 4, isArchived: false },
  { id: 'd3', phaseId: 'phase-26-1', displayName: 'GE 6 (old)', rank: 1, playersPerGame: 4, isArchived: false },
] as Division[]

const groups = [
  { id: 'g-mine', divisionId: 'd1', number: 28, teamIds: [], isArchived: false },
  { id: 'g-theirs', divisionId: 'd2', number: 1, teamIds: [], isArchived: false },
  { id: 'g-oldphase', divisionId: 'd3', number: 5, teamIds: [], isArchived: false },
] as Group[]

const team = (id: string, clubId: string, groupId: string, isArchived = false) =>
  ({ id, clubId, groupId, phaseId: 'phase-27-1', number: 1, isArchived, playerIds: [] }) as unknown as Team

const teams = [
  team('t-mine', 'club-fftt-06680011', 'g-mine'),
  team('t-theirs', 'club-fftt-06670045', 'g-theirs'),
  team('t-old', 'club-fftt-06680011', 'g-oldphase'),
]

describe('importableGroupIds', () => {
  it('offers a club admin only the pools where their club has a team', () => {
    expect(importableGroupIds({
      phaseId: 'phase-27-1', divisions, groups, teams, clubId: 'club-fftt-06680011',
    })).toEqual(['g-mine'])
  })

  it('offers a general admin every populated pool of the phase', () => {
    expect(importableGroupIds({ phaseId: 'phase-27-1', divisions, groups, teams }))
      .toEqual(['g-mine', 'g-theirs'])
  })

  it('never leaks a pool from another phase', () => {
    const ids = importableGroupIds({ phaseId: 'phase-27-1', divisions, groups, teams })
    expect(ids).not.toContain('g-oldphase')
  })

  it('ignores archived teams', () => {
    expect(importableGroupIds({
      phaseId: 'phase-27-1', divisions, groups,
      teams: [team('t-mine', 'club-fftt-06680011', 'g-mine', true)],
      clubId: 'club-fftt-06680011',
    })).toEqual([])
  })

  it('returns nothing without a phase', () => {
    expect(importableGroupIds({ phaseId: '', divisions, groups, teams })).toEqual([])
  })
})
