import { describe, expect, it } from 'vitest'
import {
  divisionPoolsQuery, parseDivisionPools, parseSportMatch, parseSportMatches,
  poolNumberFromName, selectPoolForGroup, teamNumberFromName,
  type FfttPool, type FfttSportMatchNode,
} from './ffttGames'

const NODE: FfttSportMatchNode = {
  id: '/api/sport_matches/5646635',
  roundNumber: 1,
  date: '2026-02-07T00:00:00',
  homeOpponent: {
    team: {
      id: '/api/teams/5838',
      name: 'STRASBOURG EMTT 1',
      clubs: { edges: [{ node: { id: '/api/clubs/1', identifier: '06670270', name: 'STRASBOURG EMTT' } }] },
    },
  },
  awayOpponent: {
    team: {
      id: '/api/teams/5424',
      name: 'SPICHEREN C.S.N 1',
      clubs: { edges: [{ node: { id: '/api/clubs/2', identifier: '06570030', name: 'SPICHEREN C.S.N' } }] },
    },
  },
}

describe('parseSportMatch', () => {
  it('parses a standard match node', () => {
    expect(parseSportMatch(NODE)).toEqual({
      id: '5646635',
      round: 1,
      date: '2026-02-07',
      home: {
        teamId: '5838', teamName: 'STRASBOURG EMTT 1', teamNumber: 1,
        clubIdentifier: '06670270', clubName: 'STRASBOURG EMTT',
      },
      away: {
        teamId: '5424', teamName: 'SPICHEREN C.S.N 1', teamNumber: 1,
        clubIdentifier: '06570030', clubName: 'SPICHEREN C.S.N',
      },
    })
  })

  it('returns null for a bye (missing opponent)', () => {
    expect(parseSportMatch({ ...NODE, awayOpponent: null })).toBeNull()
    expect(parseSportMatch({ ...NODE, awayOpponent: { team: null } })).toBeNull()
  })

  it('returns null without a usable round or date', () => {
    expect(parseSportMatch({ ...NODE, roundNumber: null })).toBeNull()
    expect(parseSportMatch({ ...NODE, roundNumber: 0 })).toBeNull()
    expect(parseSportMatch({ ...NODE, date: null })).toBeNull()
    expect(parseSportMatch({ ...NODE, date: 'invalid' })).toBeNull()
  })

  it('tolerates a missing club on the team', () => {
    const m = parseSportMatch({
      ...NODE,
      homeOpponent: { team: { id: '/api/teams/9', name: 'MYSTERY 3' } },
    })
    expect(m?.home).toEqual({
      teamId: '9', teamName: 'MYSTERY 3', teamNumber: 3, clubIdentifier: '', clubName: '',
    })
  })
})

describe('parseSportMatches', () => {
  it('drops unusable entries and orders by round then id', () => {
    const out = parseSportMatches([
      { node: { ...NODE, id: '/api/sport_matches/20', roundNumber: 2 } },
      { node: { ...NODE, id: '/api/sport_matches/10', roundNumber: 1 } },
      { node: { ...NODE, id: '/api/sport_matches/9', roundNumber: 1 } },
      { node: { ...NODE, id: '/api/sport_matches/30', awayOpponent: null } },
      {},
    ])
    expect(out.map((m) => [m.round, m.id])).toEqual([[1, '9'], [1, '10'], [2, '20']])
  })
})

describe('teamNumberFromName', () => {
  it.each([
    ['THIONVILLE TT 1', 1],
    ['LUNEVILLE ALTT (1)', 1],
    ['BAZEILLES PPC 12', 12],
    ['SANS NUMERO', null],
  ])('%s → %s', (name, expected) => {
    expect(teamNumberFromName(name)).toBe(expected)
  })
})

describe('divisionPoolsQuery / parseDivisionPools', () => {
  it('sanitizes the division id to digits', () => {
    expect(divisionPoolsQuery('234461"x{}')).toContain('pools(group_id: 234461)')
    expect(divisionPoolsQuery('abc')).toContain('pools(group_id: 0)')
  })

  it('parses a pools response into typed pools', () => {
    const pools = parseDivisionPools({
      pools: {
        edges: [
          { node: { id: '/api/pools/1287199', name: '1', sportMatches: { edges: [{ node: NODE }] } } },
          { node: { id: '/api/pools/1287200', name: 'B' } },
          {},
        ],
      },
    })
    expect(pools).toHaveLength(2)
    expect(pools[0]).toMatchObject({ id: '1287199', poolNumber: 1 })
    expect(pools[0].matches).toHaveLength(1)
    expect(pools[1]).toMatchObject({ id: '1287200', poolNumber: 2, matches: [] })
  })

  it('returns no pools for an empty response', () => {
    expect(parseDivisionPools({})).toEqual([])
  })
})

describe('poolNumberFromName', () => {
  it.each([
    ['3', 3],
    [' 12 ', 12],
    ['B', 2],
    ['Poule 3', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s → %s', (name, expected) => {
    expect(poolNumberFromName(name as string | null | undefined)).toBe(expected)
  })
})

describe('selectPoolForGroup', () => {
  const matchWith = (homeId: string, awayId: string) => ({
    ...parseSportMatch(NODE)!,
    home: { ...parseSportMatch(NODE)!.home, teamId: homeId },
    away: { ...parseSportMatch(NODE)!.away, teamId: awayId },
  })
  const pools: FfttPool[] = [
    { id: '1162587', poolNumber: 1, matches: [matchWith('100', '101')] },
    { id: '1162588', poolNumber: 2, matches: [matchWith('200', '201')] },
    { id: '1162590', poolNumber: 4, matches: [] },
  ]

  it('prefers the pool whose matches involve one of the group’s teams', () => {
    // Numbering drifted (group says poule 9) but team 201 is known locally.
    const pool = selectPoolForGroup(pools, { number: 9, teamIds: ['201', 'other'] })
    expect(pool?.id).toBe('1162588')
  })

  it('falls back to matching the poule number', () => {
    const pool = selectPoolForGroup(pools, { number: 4, teamIds: ['999'] })
    expect(pool?.id).toBe('1162590')
  })

  it('membership beats a competing number match', () => {
    const pool = selectPoolForGroup(pools, { number: 1, teamIds: ['200'] })
    expect(pool?.id).toBe('1162588')
  })

  it('the group’s own FFTT pool id wins over membership and number (#278)', () => {
    // Number says poule 1 and team 200 sits in 1162588, but the group knows
    // exactly which pool it is.
    const pool = selectPoolForGroup(pools, { number: 1, teamIds: ['200'], groupId: '1162590' })
    expect(pool?.id).toBe('1162590')
  })

  it('falls back to the old inference when the pool id is unknown locally', () => {
    // A group carrying a pool id FFTT no longer returns must not resolve to
    // nothing when membership still identifies it.
    const pool = selectPoolForGroup(pools, { number: 9, teamIds: ['201'], groupId: 'gone' })
    expect(pool?.id).toBe('1162588')
  })

  it('returns null when nothing lines up', () => {
    expect(selectPoolForGroup(pools, { number: 9, teamIds: ['999'] })).toBeNull()
    expect(selectPoolForGroup([], { number: 1, teamIds: [] })).toBeNull()
  })
})
