import { describe, expect, it } from 'vitest'
import { poolBadge, poolLabel, poolName, poolTitle } from './poolLabel'

// #647 — the AGR names its poules by letter.

const groups = [{ id: 'g-fftt', number: 28, divisionId: 'd-ge7' }, { id: 'g-agr', number: 1, divisionId: 'd-exc' }]
const context = {
  divisions: [{ id: 'd-ge7' }, { id: 'd-exc', competitionId: 'c-agr' }],
  competitions: [{ id: 'c-agr', federationId: 'agr' }],
}

describe('poolLabel', () => {
  it('numbers an FFTT poule and letters an AGR one', () => {
    expect(poolLabel({ groupId: 'g-fftt' }, groups, context)).toBe('P. 28')
    expect(poolLabel({ groupId: 'g-agr' }, groups, context)).toBe('Poule A')
  })

  it('reads every poule as the FFTT’s without context, as it always did', () => {
    expect(poolLabel({ groupId: 'g-agr' }, groups)).toBe('P. 1')
    expect(poolLabel({ groupId: 'nope' }, groups)).toBeUndefined()
  })
})

describe('poolName (#696)', () => {
  it('is the letter of an AGR poule and the number of an FFTT one, wherever a poule is listed', () => {
    expect(poolName(groups[1], context)).toBe('A')
    expect(poolName(groups[0], context)).toBe('28')
    expect(poolName(groups[1])).toBe('1')
    expect(poolTitle(groups[1], context)).toBe('Poule A')
    expect(poolTitle(groups[0], context)).toBe('Groupe 28')
  })
})

describe('poolBadge (#716)', () => {
  it('is the letter alone at the AGR, and the FFTT’s badge unchanged', () => {
    expect(poolBadge({ groupId: 'g-agr' }, groups, context)).toBe('A')
    expect(poolBadge({ groupId: 'g-fftt' }, groups, context)).toBe('P. 28')
    expect(poolBadge({ groupId: 'g-agr' }, groups)).toBe('P. 1')
    expect(poolBadge({ groupId: 'nope' }, groups, context)).toBeUndefined()
  })
})
