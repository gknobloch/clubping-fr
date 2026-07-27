import { describe, it, expect } from 'vitest'
import { deriveMatchDayDate, gameDate, playersCommittedElsewhere } from './matchdays'
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
      { id: 's1', gameId: 'g1', teamId: 'team-1', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere('team-2', 1, clubTeams, games, matchDays, selections)
    expect(committed.get('p1')).toBe(1)
  })

  it('ignores selections for the current team itself', () => {
    const selections: GameSelection[] = [
      { id: 's1', gameId: 'g2', teamId: 'team-2', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere('team-2', 1, clubTeams, games, matchDays, selections)
    expect(committed.has('p1')).toBe(false)
  })

  it('ignores selections from a different round', () => {
    const otherRoundMd: MatchDay = { id: 'md-2', groupId: 'group-1', number: 2, date: '2026-01-08' }
    const otherRoundGame: Game = { id: 'g3', matchDayId: 'md-2', homeTeamId: 'team-1', awayTeamId: 'opp-1' }
    const selections: GameSelection[] = [
      { id: 's1', gameId: 'g3', teamId: 'team-1', playerIds: ['p1'] },
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
