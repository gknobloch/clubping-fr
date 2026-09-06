import { describe, it, expect } from 'vitest'
import type { PlayerSeasonCategory } from '@/types'
import {
  categoryFor,
  categoryFromIndex,
  categoryHistory,
  seasonCategoryIndex,
  withSeasonCategory,
} from './seasonCategories'

// #482 — a category is a fact about a season, not about a person: a cadet
// becomes a junior, and last season's answer must survive this season's import.

const rows: PlayerSeasonCategory[] = [
  { seasonId: '26', playerId: 'p1', category: 'C1' },
  { seasonId: '27', playerId: 'p1', category: 'J1' },
  { seasonId: '27', playerId: 'p2', category: 'V50' },
]

describe('categoryFor', () => {
  it('answers per season, so one player has two answers', () => {
    expect(categoryFor(rows, '26', 'p1')).toBe('C1')
    expect(categoryFor(rows, '27', 'p1')).toBe('J1')
  })

  it('is undefined where nothing is recorded, and for a missing argument', () => {
    expect(categoryFor(rows, '27', 'p3')).toBeUndefined()
    expect(categoryFor(rows, '25', 'p1')).toBeUndefined()
    expect(categoryFor(rows, undefined, 'p1')).toBeUndefined()
    expect(categoryFor(rows, '27', undefined)).toBeUndefined()
  })
})

describe('seasonCategoryIndex', () => {
  it('reads the same as categoryFor, for a screen that asks forty times', () => {
    const index = seasonCategoryIndex(rows)
    expect(categoryFromIndex(index, '26', 'p1')).toBe('C1')
    expect(categoryFromIndex(index, '27', 'p2')).toBe('V50')
    expect(categoryFromIndex(index, '27', 'p3')).toBeUndefined()
    expect(categoryFromIndex(index, undefined, 'p1')).toBeUndefined()
  })
})

describe('withSeasonCategory', () => {
  const players = [{ id: 'p1', firstName: 'A' }, { id: 'p3', firstName: 'B' }]

  it('attaches the season asked for, and leaves the unknown without one', () => {
    const out = withSeasonCategory(players, rows, '26')
    expect(out).toEqual([
      { id: 'p1', firstName: 'A', category: 'C1' },
      { id: 'p3', firstName: 'B' },
    ])
  })

  it('attaches nothing at all when no season is in view', () => {
    expect(withSeasonCategory(players, rows, undefined).every((p) => !('category' in p))).toBe(true)
  })

  it('copies rather than mutating what it was handed', () => {
    const out = withSeasonCategory(players, rows, '26')
    expect(out[0]).not.toBe(players[0])
    expect('category' in players[0]).toBe(false)
  })
})

describe('categoryHistory', () => {
  it('lists one player’s seasons, most recent first', () => {
    expect(categoryHistory(rows, 'p1')).toEqual([
      { seasonId: '27', playerId: 'p1', category: 'J1' },
      { seasonId: '26', playerId: 'p1', category: 'C1' },
    ])
  })

  it('sorts numerically, not as text — season 9 precedes season 10', () => {
    const many: PlayerSeasonCategory[] = [
      { seasonId: '9', playerId: 'p1', category: 'B' },
      { seasonId: '10', playerId: 'p1', category: 'M' },
    ]
    expect(categoryHistory(many, 'p1').map((r) => r.seasonId)).toEqual(['10', '9'])
  })

  it('is empty for a player with nothing on file', () => {
    expect(categoryHistory(rows, 'p9')).toEqual([])
  })
})
