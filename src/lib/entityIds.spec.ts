import { describe, expect, it } from 'vitest'
import { gameIdFor, teamIdFor } from './entityIds'

describe('teamIdFor', () => {
  it('derives a readable id from club, phase and number', () => {
    expect(teamIdFor('club-fftt-06680011', 'phase-27-1', 3)).toBe('team-06680011-27-1-3')
  })

  it('is stable: the same inputs always give the same id', () => {
    expect(teamIdFor('club-fftt-06680011', 'phase-27-1', 3))
      .toBe(teamIdFor('club-fftt-06680011', 'phase-27-1', '3'))
  })

  it('separates the same team number across phases', () => {
    expect(teamIdFor('club-fftt-06680011', 'phase-26-1', 1))
      .not.toBe(teamIdFor('club-fftt-06680011', 'phase-27-1', 1))
  })

  it('separates the same number across clubs', () => {
    expect(teamIdFor('club-fftt-06680011', 'phase-27-1', 1))
      .not.toBe(teamIdFor('club-fftt-06680125', 'phase-27-1', 1))
  })

  it('tolerates an id that does not carry the usual prefix', () => {
    expect(teamIdFor('club-legacy', 'phase-27-1', 2)).toBe('team-club-legacy-27-1-2')
  })
})

describe('gameIdFor', () => {
  it('derives from the journée and both teams, dropping the team- prefix', () => {
    expect(gameIdFor('md-g1-1', 'team-06680011-27-1-3', 'team-06680125-27-1-1'))
      .toBe('game-g1-1-06680011-27-1-3-06680125-27-1-1')
  })

  it('distinguishes home from away', () => {
    const a = gameIdFor('md-1', 'team-A', 'team-B')
    const b = gameIdFor('md-1', 'team-B', 'team-A')
    expect(a).not.toBe(b)
  })

  it('distinguishes the same pairing across journées', () => {
    expect(gameIdFor('md-1', 'team-A', 'team-B')).not.toBe(gameIdFor('md-2', 'team-A', 'team-B'))
  })
})
