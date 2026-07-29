import { describe, it, expect } from 'vitest'
import { deriveMatchDayDate, gameDate, gameSchedule, isoWeekRange, playersCommittedElsewhere } from './matchdays'
import type { Team, Game, MatchDay, GameSelection } from '../types'

const team = (id: string, number: number): Team => ({
  id, clubId: 'club-1', phaseId: 'phase-1', number, divisionId: 'div-1', groupId: 'group-1',
  gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false,
})

describe('playersCommittedElsewhere', () => {
  const clubTeams = [team('team-1', 1), team('team-2', 2)]
  const matchDays: MatchDay[] = [{ id: 'md-1', groupId: 'group-1', number: 1, date: '2026-01-01' }]
  const games: Game[] = [
    { id: 'g1', matchDayId: 'md-1', homeTeamId: 'team-1', awayTeamId: 'opp-1' },
    { id: 'g2', matchDayId: 'md-1', homeTeamId: 'team-2', awayTeamId: 'opp-2' },
  ]

  it('maps a player selected for another club team on the same round to that team number', () => {
    const selections: GameSelection[] = [
      { gameId: 'g1', teamId: 'team-1', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere('team-2', 1, clubTeams, games, matchDays, selections)
    expect(committed.get('p1')).toBe(1)
  })

  it('ignores selections for the current team itself', () => {
    const selections: GameSelection[] = [
      { gameId: 'g2', teamId: 'team-2', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere('team-2', 1, clubTeams, games, matchDays, selections)
    expect(committed.has('p1')).toBe(false)
  })

  it('ignores selections from a different round', () => {
    const otherRoundMd: MatchDay = { id: 'md-2', groupId: 'group-1', number: 2, date: '2026-01-08' }
    const otherRoundGame: Game = { id: 'g3', matchDayId: 'md-2', homeTeamId: 'team-1', awayTeamId: 'opp-1' }
    const selections: GameSelection[] = [
      { gameId: 'g3', teamId: 'team-1', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere(
      'team-2', 1, clubTeams, [...games, otherRoundGame], [...matchDays, otherRoundMd], selections,
    )
    expect(committed.has('p1')).toBe(false)
  })
})

// Games own their date (#271); match_days.date is derived from them client-side
// the same way the server recomputes it — see matchDayDateRecomputeStmt.
describe('deriveMatchDayDate', () => {
  const g = (id: string, matchDayId: string, date?: string): Game =>
    ({ id, matchDayId, homeTeamId: 'team-1', awayTeamId: 'team-2', date })

  it('returns the earliest date among the match day\'s dated games', () => {
    const games = [g('g1', 'md-1', '2026-09-20'), g('g2', 'md-1', '2026-09-19'), g('g3', 'md-1', '2026-09-21')]
    expect(deriveMatchDayDate(games, '2026-09-01')).toBe('2026-09-19')
  })

  it('falls back to the current date when no game has one yet (empty shell)', () => {
    expect(deriveMatchDayDate([], '2026-09-01')).toBe('2026-09-01')
    expect(deriveMatchDayDate([g('g1', 'md-1')], '2026-09-01')).toBe('2026-09-01')
  })

  it('ignores undated games alongside dated ones', () => {
    const games = [g('g1', 'md-1'), g('g2', 'md-1', '2026-09-19')]
    expect(deriveMatchDayDate(games, '2026-09-01')).toBe('2026-09-19')
  })

  it('returns a single game\'s own date', () => {
    expect(deriveMatchDayDate([g('g1', 'md-1', '2026-09-19')], '2026-09-01')).toBe('2026-09-19')
  })
})

describe('gameDate', () => {
  const md: MatchDay = { id: 'md-1', groupId: 'group-1', number: 1, date: '2026-09-01' }

  it('prefers the game\'s own date', () => {
    const game: Game = { id: 'g1', matchDayId: 'md-1', homeTeamId: 'team-1', awayTeamId: 'team-2', date: '2026-09-20' }
    expect(gameDate(game, md)).toBe('2026-09-20')
  })

  it('falls back to the match day\'s (derived) date when the game has none', () => {
    const game: Game = { id: 'g1', matchDayId: 'md-1', homeTeamId: 'team-1', awayTeamId: 'team-2' }
    expect(gameDate(game, md)).toBe('2026-09-01')
  })
})

describe('isoWeekRange', () => {
  it('gives Monday to Sunday of the week containing the date', () => {
    // dim. 8 nov. 2026 -> lun. 2 nov. – dim. 8 nov.
    expect(isoWeekRange('2026-11-08')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(isoWeekRange('2026-11-02')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(isoWeekRange('2026-11-05')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
  })

  it('crosses a month and a year boundary', () => {
    expect(isoWeekRange('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })

  it('returns null for a malformed date', () => {
    expect(isoWeekRange('')).toBeNull()
    expect(isoWeekRange('08/11/2026')).toBeNull()
  })
})

describe('gameSchedule', () => {
  const md = { date: '2026-11-08' }
  const known = { defaultDay: 'Jeudi', defaultTime: '19h30' }
  const unknown = { defaultDay: '', defaultTime: '' }

  it('shows the real slot for a home fixture on a known playing day', () => {
    expect(gameSchedule({ date: '2026-11-05', time: undefined }, md, known))
      .toEqual({ date: '2026-11-05', time: '19h30', week: null })
  })

  it('falls back to the journée date for a game that has none of its own', () => {
    // Manually created fixtures carry no date; they must not be treated as
    // unconfirmed just for that.
    expect(gameSchedule({ date: undefined, time: undefined }, md, known))
      .toEqual({ date: '2026-11-08', time: '19h30', week: null })
    expect(gameSchedule(undefined, md, known))
      .toEqual({ date: '2026-11-08', time: '19h30', week: null })
  })

  it('falls back to the journée week when the home club’s day is unknown', () => {
    // The reported case: an away game at an auto-created opponent.
    expect(gameSchedule({ date: '2026-11-08', time: undefined }, md, unknown))
      .toEqual({ date: null, time: '', week: { start: '2026-11-02', end: '2026-11-08' } })
  })

  it('never borrows a time when the slot is unknown', () => {
    const s = gameSchedule({ date: '2026-11-08', time: undefined }, md, undefined)
    expect(s.time).toBe('')
    expect(s.date).toBeNull()
  })

  it('an explicit game time pins the slot, whatever the teams say', () => {
    expect(gameSchedule({ date: '2026-11-07', time: '14h00' }, md, unknown))
      .toEqual({ date: '2026-11-07', time: '14h00', week: null })
  })

  it('uses the HOME team’s default time, not the viewer’s', () => {
    expect(gameSchedule({ date: '2026-11-06', time: undefined }, md, { defaultDay: 'Vendredi', defaultTime: '20h00' }).time)
      .toBe('20h00')
  })
})
