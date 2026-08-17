import { describe, expect, it } from 'vitest'
import { jsonParseIds } from './rows'

// These replaced `jsonParse(x) as string[]` (#285). The cast promised a shape
// nothing checked; what matters here is what they do with a column that does
// not hold what it should — which migration 0034 proved can happen.

describe('jsonParseIds', () => {
  it('decodes a JSON array column', () => {
    expect(jsonParseIds('["team-a","team-b"]')).toEqual(['team-a', 'team-b'])
  })

  it('returns an empty list for an empty or absent column', () => {
    expect(jsonParseIds('[]')).toEqual([])
    expect(jsonParseIds(null)).toEqual([])
    expect(jsonParseIds(undefined)).toEqual([])
  })

  it('drops entries that are not ids — the 0034 case', () => {
    // A NULL had leaked into a group's team_ids array in production.
    expect(jsonParseIds('["team-a",null,"team-b"]')).toEqual(['team-a', 'team-b'])
    expect(jsonParseIds('["team-a",42,{"id":"x"}]')).toEqual(['team-a'])
  })

  it('returns an empty list when the column is not an array at all', () => {
    expect(jsonParseIds('{"team":"a"}')).toEqual([])
    expect(jsonParseIds('not json')).toEqual([])
    expect(jsonParseIds(7)).toEqual([])
  })
})
