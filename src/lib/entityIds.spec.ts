import { describe, expect, it } from 'vitest'
import { gameIdFor, homeGameDate, teamIdFor } from './entityIds'

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

describe('homeGameDate', () => {
  it('moves a Sunday fixture back to the preceding Thursday', () => {
    // The reported case: J1 dim. 20 sept. for a Thursday team -> jeudi 17 sept.
    expect(homeGameDate('2026-09-20', 'Jeudi')).toBe('2026-09-17')
  })

  it('leaves a fixture already on the team’s day alone', () => {
    expect(homeGameDate('2026-09-17', 'Jeudi')).toBe('2026-09-17')
  })

  it('never moves more than six days back', () => {
    // Friday -> preceding Saturday is 6 days back, not 1 day forward.
    expect(homeGameDate('2026-09-18', 'Samedi')).toBe('2026-09-12')
  })

  it('crosses a month boundary correctly', () => {
    expect(homeGameDate('2026-10-04', 'Jeudi')).toBe('2026-10-01')
    expect(homeGameDate('2026-11-01', 'Jeudi')).toBe('2026-10-29')
  })

  it('is stable when there is no usable default day', () => {
    expect(homeGameDate('2026-09-20', undefined)).toBe('2026-09-20')
    expect(homeGameDate('2026-09-20', '')).toBe('2026-09-20')
    expect(homeGameDate('2026-09-20', 'Thursday')).toBe('2026-09-20')
  })

  it('leaves a malformed date untouched', () => {
    expect(homeGameDate('', 'Jeudi')).toBe('')
    expect(homeGameDate('20/09/2026', 'Jeudi')).toBe('20/09/2026')
  })
})

describe('homeGameDate — applied consistently on create and update (#299)', () => {
  it('gives the same answer however many times it is applied', () => {
    // Re-dating an already-shifted fixture must be a no-op, not a move back
    // to the nominal date: the FFTT import used to write m.date raw when
    // updating, so a second run put every home game back on the Sunday.
    const nominal = '2026-11-22'
    const once = homeGameDate(nominal, 'Jeudi')
    expect(once).toBe('2026-11-19')
    expect(homeGameDate(once, 'Jeudi')).toBe(once)
  })

  it('leaves an away fixture on the nominal date when the home club is unknown', () => {
    expect(homeGameDate('2026-11-22', '')).toBe('2026-11-22')
  })
})
