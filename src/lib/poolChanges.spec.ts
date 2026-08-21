import { describe, expect, it } from 'vitest'
import {
  departingTeamIds, emptiedMatchDayIds, obsoleteGames, playingTeamIds,
  type ExistingGameRef, type SourceRound,
} from './poolChanges'

/** The J1 of a four-fixture poule as it stands locally. */
const J1: ExistingGameRef[] = [
  { id: 'g1', matchDayId: 'md1', homeTeamId: 'ppa3', awayTeamId: 'old1' },
  { id: 'g2', matchDayId: 'md1', homeTeamId: 'old2', awayTeamId: 'old3' },
]

const round = (matchDayId: string, pairs: Array<[string, string]>, incomplete = false): SourceRound => ({
  matchDayId,
  pairings: pairs.map(([homeTeamId, awayTeamId]) => ({ homeTeamId, awayTeamId })),
  incomplete,
})

describe('obsoleteGames', () => {
  it('reports the fixtures the source no longer states', () => {
    const result = obsoleteGames(J1, [round('md1', [['ppa3', 'new1'], ['old2', 'old3']])])
    expect(result).toEqual({ ids: ['g1'], manual: 0 })
  })

  it('recognises a fixture reversed home/away as the same fixture', () => {
    const result = obsoleteGames(J1, [round('md1', [['old1', 'ppa3'], ['old3', 'old2']])])
    expect(result.ids).toEqual([])
  })

  it('leaves alone a journée the source says nothing about', () => {
    // The FFTT has only published J1 so far; J2 must survive untouched.
    const existing = [...J1, { id: 'g3', matchDayId: 'md2', homeTeamId: 'ppa3', awayTeamId: 'old2' }]
    const result = obsoleteGames(existing, [round('md1', [['ppa3', 'new1'], ['old2', 'old3']])])
    expect(result.ids).toEqual(['g1'])
  })

  it('drops nothing from a round it could not fully read', () => {
    const result = obsoleteGames(J1, [round('md1', [['ppa3', 'new1']], true)])
    expect(result.ids).toEqual([])
  })

  it('counts hand-agreed slots apart, but still calls them obsolete', () => {
    const existing: ExistingGameRef[] = [
      { ...J1[0], source: 'manual' },
      { ...J1[1], source: 'fftt' },
    ]
    const result = obsoleteGames(existing, [round('md1', [['ppa3', 'new1']])])
    expect(result).toEqual({ ids: ['g1', 'g2'], manual: 1 })
  })

  it('reports nothing when the pool is unchanged', () => {
    const result = obsoleteGames(J1, [round('md1', [['ppa3', 'old1'], ['old2', 'old3']])])
    expect(result).toEqual({ ids: [], manual: 0 })
  })
})

describe('playingTeamIds', () => {
  it('collects both sides of every pairing', () => {
    const ids = playingTeamIds([round('md1', [['ppa3', 'new1'], ['old2', 'old3']])])
    expect(ids.sort()).toEqual(['new1', 'old2', 'old3', 'ppa3'])
  })

  it('states nothing when a round could not be fully read', () => {
    expect(playingTeamIds([round('md1', [['ppa3', 'new1']], true)])).toEqual([])
  })
})

describe('departingTeamIds', () => {
  const groupTeamIds = ['ppa3', 'old1', 'old2', 'old3']

  it('lists the teams the source no longer holds', () => {
    const source = playingTeamIds([round('md1', [['ppa3', 'new1'], ['old2', 'old3']])])
    expect(departingTeamIds(groupTeamIds, source)).toEqual(['old1'])
  })

  it('empties nothing when the source states no team at all', () => {
    expect(departingTeamIds(groupTeamIds, [])).toEqual([])
  })

  it('reads a document roster as the pool composition', () => {
    expect(departingTeamIds(groupTeamIds, ['ppa3', 'old2', 'old3', 'new1'])).toEqual(['old1'])
  })
})

describe('emptiedMatchDayIds', () => {
  it('reports a journée whose every game is deleted', () => {
    expect(emptiedMatchDayIds(J1, ['g1', 'g2'], [])).toEqual(['md1'])
  })

  it('keeps a journée that gains a replacement fixture', () => {
    expect(emptiedMatchDayIds(J1, ['g1', 'g2'], [{ matchDayId: 'md1' }])).toEqual([])
  })

  it('ignores journées nothing was deleted from', () => {
    expect(emptiedMatchDayIds(J1, [], [])).toEqual([])
  })
})
