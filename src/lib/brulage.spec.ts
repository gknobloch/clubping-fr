import { describe, it, expect } from 'vitest'
import { computeBrulage, isPlayerEligibleForTeam } from './brulage'
import type { Team, Game, MatchDay, GameSelection } from '@/types'

const makeTeam = (overrides: Partial<Team> & { id: string; number: number; clubId: string; groupId: string }): Team => ({
  phaseId: 'phase-1',
  divisionId: 'div-1',
  gameLocationId: 'addr-1',
  defaultDay: 'Jeudi',
  defaultTime: '20h00',
  captainId: '',
  playerIds: [],
  isArchived: false,
  ...overrides,
})

const makeMatchDay = (id: string, number: number, groupId: string = 'group-a'): MatchDay => ({
  id,
  groupId,
  number,
  date: `2025-01-${String(number).padStart(2, '0')}`,
})

const makeGame = (id: string, matchDayId: string, homeTeamId: string, awayTeamId: string): Game => ({
  id,
  matchDayId,
  homeTeamId,
  awayTeamId,
})

const makeSel = (gameId: string, teamId: string, playerIds: string[]): GameSelection => ({
  gameId,
  teamId,
  playerIds,
})

// Teams in DIFFERENT groups (for testing rule 1 in isolation)
const team1 = makeTeam({ id: 'team-1', number: 1, clubId: 'club-1', groupId: 'group-a' })
const team2 = makeTeam({ id: 'team-2', number: 2, clubId: 'club-1', groupId: 'group-b' })
const team3 = makeTeam({ id: 'team-3', number: 3, clubId: 'club-1', groupId: 'group-c' })
const clubTeams = [team1, team2, team3]

const md1 = makeMatchDay('md-1', 1)
const md2 = makeMatchDay('md-2', 2)
const md3 = makeMatchDay('md-3', 3)
const md4 = makeMatchDay('md-4', 4)
const matchDays = [md1, md2, md3, md4]

describe('computeBrulage', () => {
  it('returns no restriction when player has no games', () => {
    expect(computeBrulage('p1', clubTeams, matchDays, [], []))
      .toEqual({ burnedIntoTeamNumber: null, burnedIntoTeamId: null })
  })

  it('returns no restriction after 1 game in any single team', () => {
    const game = makeGame('g-1', 'md-1', 'team-1', 'team-x')
    const sel = makeSel('g-1', 'team-1', ['p1'])
    expect(computeBrulage('p1', clubTeams, matchDays, [game], [sel]))
      .toEqual({ burnedIntoTeamNumber: null, burnedIntoTeamId: null })
  })

  it('burns into team 1 after 2 games in team 1', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-1', 'team-x'),
      makeGame('g-2', 'md-2', 'team-1', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-1', ['p1']), makeSel('g-2', 'team-1', ['p1'])]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: 1, burnedIntoTeamId: 'team-1' })
  })

  it('burns into team 2 after 1 game in team 1 + 1 game in team 2', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-2', 'team-x'),
      makeGame('g-2', 'md-2', 'team-1', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-2', ['p1']), makeSel('g-2', 'team-1', ['p1'])]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: 2, burnedIntoTeamId: 'team-2' })
  })

  it('burns into team 2 after 2 games in team 2 (even without team 1 games)', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-2', 'team-x'),
      makeGame('g-2', 'md-2', 'team-2', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-2', ['p1']), makeSel('g-2', 'team-2', ['p1'])]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: 2, burnedIntoTeamId: 'team-2' })
  })

  it('burns into last team (team 3) after 2 games there, even with no lower team', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-3', 'team-x'),
      makeGame('g-2', 'md-2', 'team-3', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-3', ['p1']), makeSel('g-2', 'team-3', ['p1'])]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: 3, burnedIntoTeamId: 'team-3' })
  })

  it('burns into team 2 when 1 game each in teams 1, 2, 3 (team 3 ineligible)', () => {
    // games < team3 = 2 (team1+team2) > 1 → can't play team 3 → burned into team 2
    const games = [
      makeGame('g-1', 'md-1', 'team-1', 'team-x'),
      makeGame('g-2', 'md-2', 'team-2', 'team-x'),
      makeGame('g-3', 'md-3', 'team-3', 'team-x'),
    ]
    const sels = [
      makeSel('g-1', 'team-1', ['p1']),
      makeSel('g-2', 'team-2', ['p1']),
      makeSel('g-3', 'team-3', ['p1']),
    ]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: 2, burnedIntoTeamId: 'team-2' })
  })

  it('2 games in team 1 + 1 game in team 3 → burned into team 1 (not team 3)', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-1', 'team-x'),
      makeGame('g-2', 'md-2', 'team-3', 'team-x'),
      makeGame('g-3', 'md-3', 'team-1', 'team-x'),
    ]
    const sels = [
      makeSel('g-1', 'team-1', ['p1']),
      makeSel('g-2', 'team-3', ['p1']),
      makeSel('g-3', 'team-1', ['p1']),
    ]
    // games < team2 = 2 (team1) > 1 → can't play team 2 → burned into team 1
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: 1, burnedIntoTeamId: 'team-1' })
  })

  it('respects asOfMatchDayId cutoff', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-1', 'team-x'),
      makeGame('g-2', 'md-2', 'team-1', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-1', ['p1']), makeSel('g-2', 'team-1', ['p1'])]

    expect(computeBrulage('p1', clubTeams, matchDays, games, sels, 'md-2'))
      .toEqual({ burnedIntoTeamNumber: null, burnedIntoTeamId: null })
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels, 'md-3'))
      .toEqual({ burnedIntoTeamNumber: 1, burnedIntoTeamId: 'team-1' })
  })

  it('ignores selections for other players', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-1', 'team-x'),
      makeGame('g-2', 'md-2', 'team-1', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-1', ['other']), makeSel('g-2', 'team-1', ['other'])]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: null, burnedIntoTeamId: null })
  })

  it('ignores games from other clubs', () => {
    const games = [
      makeGame('g-1', 'md-1', 'team-other', 'team-x'),
      makeGame('g-2', 'md-2', 'team-other', 'team-x'),
    ]
    const sels = [makeSel('g-1', 'team-other', ['p1']), makeSel('g-2', 'team-other', ['p1'])]
    expect(computeBrulage('p1', clubTeams, matchDays, games, sels))
      .toEqual({ burnedIntoTeamNumber: null, burnedIntoTeamId: null })
  })
})

describe('isPlayerEligibleForTeam', () => {
  describe('rule 1: brûlage (max 1 game in higher-ranked teams)', () => {
    it('eligible everywhere when no games played', () => {
      expect(isPlayerEligibleForTeam('p1', team1, clubTeams, matchDays, [], [], 'md-1')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, [], [], 'md-1')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team3, clubTeams, matchDays, [], [], 'md-1')).toBe(true)
    })

    it('eligible everywhere after 1 game in team 1 (max 1 allowed)', () => {
      const game = makeGame('g-1', 'md-1', 'team-1', 'team-x')
      const sel = makeSel('g-1', 'team-1', ['p1'])

      expect(isPlayerEligibleForTeam('p1', team1, clubTeams, matchDays, [game], [sel], 'md-2')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, [game], [sel], 'md-2')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team3, clubTeams, matchDays, [game], [sel], 'md-2')).toBe(true)
    })

    it('2 games in team 1 → only eligible for team 1', () => {
      const games = [
        makeGame('g-1', 'md-1', 'team-1', 'team-x'),
        makeGame('g-2', 'md-2', 'team-1', 'team-x'),
      ]
      const sels = [makeSel('g-1', 'team-1', ['p1']), makeSel('g-2', 'team-1', ['p1'])]

      expect(isPlayerEligibleForTeam('p1', team1, clubTeams, matchDays, games, sels, 'md-3')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, games, sels, 'md-3')).toBe(false)
      expect(isPlayerEligibleForTeam('p1', team3, clubTeams, matchDays, games, sels, 'md-3')).toBe(false)
    })

    it('1 game in team 1 + 1 game in team 2 → eligible for team 1 and 2, not 3', () => {
      const games = [
        makeGame('g-1', 'md-1', 'team-2', 'team-x'),
        makeGame('g-2', 'md-2', 'team-1', 'team-x'),
      ]
      const sels = [makeSel('g-1', 'team-2', ['p1']), makeSel('g-2', 'team-1', ['p1'])]

      expect(isPlayerEligibleForTeam('p1', team1, clubTeams, matchDays, games, sels, 'md-3')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, games, sels, 'md-3')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team3, clubTeams, matchDays, games, sels, 'md-3')).toBe(false)
    })

    it('2 games in team 2 → eligible for team 1 and 2, not 3', () => {
      const games = [
        makeGame('g-1', 'md-1', 'team-2', 'team-x'),
        makeGame('g-2', 'md-2', 'team-2', 'team-x'),
      ]
      const sels = [makeSel('g-1', 'team-2', ['p1']), makeSel('g-2', 'team-2', ['p1'])]

      expect(isPlayerEligibleForTeam('p1', team1, clubTeams, matchDays, games, sels, 'md-3')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, games, sels, 'md-3')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team3, clubTeams, matchDays, games, sels, 'md-3')).toBe(false)
    })

    it('respects cutoff — not burned until games are in prior match-days', () => {
      const games = [
        makeGame('g-1', 'md-1', 'team-1', 'team-x'),
        makeGame('g-2', 'md-2', 'team-1', 'team-x'),
      ]
      const sels = [makeSel('g-1', 'team-1', ['p1']), makeSel('g-2', 'team-1', ['p1'])]

      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, games, sels, 'md-2')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', team2, clubTeams, matchDays, games, sels, 'md-3')).toBe(false)
    })
  })

  describe('rule 2: same-group restriction', () => {
    // teamS1 and teamS2 share a group; teamS3 is in a different group
    const teamS1 = makeTeam({ id: 'team-s1', number: 1, clubId: 'club-1', groupId: 'group-shared' })
    const teamS2 = makeTeam({ id: 'team-s2', number: 2, clubId: 'club-1', groupId: 'group-shared' })
    const teamS3 = makeTeam({ id: 'team-s3', number: 3, clubId: 'club-1', groupId: 'group-other' })
    const sgTeams = [teamS1, teamS2, teamS3]

    const sgMd1 = makeMatchDay('sg-md-1', 1, 'group-shared')
    const sgMd2 = makeMatchDay('sg-md-2', 2, 'group-shared')
    const sgMatchDays = [sgMd1, sgMd2]

    it('playing in one same-group team blocks the other on next match-day', () => {
      const game = makeGame('g-1', 'sg-md-1', 'team-s1', 'team-x')
      const sel = makeSel('g-1', 'team-s1', ['p1'])

      // As of sg-md-2: played in team-s1 → can still play team-s1, NOT team-s2 (same group)
      expect(isPlayerEligibleForTeam('p1', teamS1, sgTeams, sgMatchDays, [game], [sel], 'sg-md-2')).toBe(true)
      expect(isPlayerEligibleForTeam('p1', teamS2, sgTeams, sgMatchDays, [game], [sel], 'sg-md-2')).toBe(false)
      // team-s3 is in a different group → still eligible
      expect(isPlayerEligibleForTeam('p1', teamS3, sgTeams, sgMatchDays, [game], [sel], 'sg-md-2')).toBe(true)
    })

    it('same-group rule does not apply on the same match-day (only prior)', () => {
      const game = makeGame('g-1', 'sg-md-1', 'team-s1', 'team-x')
      const sel = makeSel('g-1', 'team-s1', ['p1'])

      // As of sg-md-1 itself, nothing prior counts
      expect(isPlayerEligibleForTeam('p1', teamS2, sgTeams, sgMatchDays, [game], [sel], 'sg-md-1')).toBe(true)
    })
  })
})
