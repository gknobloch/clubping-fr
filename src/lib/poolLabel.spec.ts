import { describe, expect, it } from 'vitest'
import { poolLabel } from './poolLabel'

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
