import { describe, it, expect } from 'vitest'
import { filterPlayersBySearch, matchesPlayerSearch, normalizeForSearch } from './playerSearch'

const player = (firstName: string, lastName: string) => ({ firstName, lastName })

describe('normalizeForSearch', () => {
  it('strips accents and case', () => {
    expect(normalizeForSearch('Frédéric')).toBe('frederic')
    expect(normalizeForSearch('ÉCUYER')).toBe('ecuyer')
  })

  it('trims surrounding spaces', () => {
    expect(normalizeForSearch('  muller  ')).toBe('muller')
  })
})

describe('matchesPlayerSearch', () => {
  const frederic = player('Frédéric', 'Zilbermann')

  it('matches on the last name', () => {
    expect(matchesPlayerSearch(frederic, 'zilber')).toBe(true)
  })

  it('matches on the first name', () => {
    expect(matchesPlayerSearch(frederic, 'fred')).toBe(true)
  })

  it('ignores accents on both sides', () => {
    expect(matchesPlayerSearch(frederic, 'frederic')).toBe(true)
    expect(matchesPlayerSearch(player('Frederic', 'Ecuyer'), 'écuyer')).toBe(true)
  })

  it('accepts the words in either order', () => {
    expect(matchesPlayerSearch(frederic, 'zilbermann frederic')).toBe(true)
    expect(matchesPlayerSearch(frederic, 'frederic zilbermann')).toBe(true)
  })

  it('requires every word to match, so a second word narrows', () => {
    expect(matchesPlayerSearch(frederic, 'frederic broglin')).toBe(false)
  })

  it('matches everyone on an empty or blank query', () => {
    expect(matchesPlayerSearch(frederic, '')).toBe(true)
    expect(matchesPlayerSearch(frederic, '   ')).toBe(true)
  })
})

describe('filterPlayersBySearch', () => {
  const roster = [player('Nicolas', 'Broglin'), player('Gilles', 'Knobloch'), player('David', 'Schmitt')]

  it('keeps the matching players in their original order', () => {
    expect(filterPlayersBySearch(roster, 'o').map((p) => p.lastName)).toEqual([
      'Broglin',
      'Knobloch',
    ])
  })

  it('returns the list untouched when the query is blank', () => {
    expect(filterPlayersBySearch(roster, '  ')).toBe(roster)
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterPlayersBySearch(roster, 'zzz')).toEqual([])
  })
})
