import { describe, expect, it } from 'vitest'
import { placeBestRanked, reservedLine, reservedLineNote, sheetLetters, sheetOrderRefusal } from './matchSheet'

// #650 — the AGR's letters and its one placement rule; the FFTT unchanged.

const p = (name: string, points?: string) => ({ name, points })
const names = (order: Array<{ name: string }>) => order.map((x) => x.name)

describe('sheetLetters', () => {
  it('keeps the FFTT’s: A.. at home, ..Z away', () => {
    expect(sheetLetters('fftt', 4, 'home')).toEqual(['A', 'B', 'C', 'D'])
    expect(sheetLetters('fftt', 4, 'away')).toEqual(['W', 'X', 'Y', 'Z'])
    expect(sheetLetters(undefined, 3, 'away')).toEqual(['X', 'Y', 'Z'])
  })

  it('starts the AGR’s away side at U, three or four a side', () => {
    expect(sheetLetters('agr', 4, 'away')).toEqual(['U', 'V', 'W', 'X'])
    expect(sheetLetters('agr', 3, 'away')).toEqual(['U', 'V', 'W'])
    expect(sheetLetters('agr', 3, 'home')).toEqual(['A', 'B', 'C'])
  })
})

describe('the best ranked in A or V (AGR, four a side)', () => {
  const lineUp = [p('Léa', '45'), p('Marc', '25'), p('Noé', '60'), p('Ugo', '30')]

  it('reserves A at home and V away, and nothing three a side or at the FFTT', () => {
    expect(reservedLine('agr', 4, 'home')).toBe(0)
    expect(reservedLine('agr', 4, 'away')).toBe(1)
    expect(reservedLine('agr', 3, 'away')).toBeNull()
    expect(reservedLine('fftt', 4, 'home')).toBeNull()
  })

  it('opens with the lowest classement there, swapping only the one it displaces', () => {
    expect(names(placeBestRanked(lineUp, 'agr', 'home'))).toEqual(['Marc', 'Léa', 'Noé', 'Ugo'])
    expect(names(placeBestRanked(lineUp, 'agr', 'away'))).toEqual(['Léa', 'Marc', 'Noé', 'Ugo'])
    expect(names(placeBestRanked(lineUp, 'fftt', 'home'))).toEqual(['Léa', 'Marc', 'Noé', 'Ugo'])
  })

  it('accepts either of two tied, and refuses anyone else, saying why', () => {
    const tied = [p('Léa', '25'), p('Marc', '25'), p('Noé', '60'), p('Ugo', '30')]
    expect(sheetOrderRefusal(tied, 'agr', 'home')).toBeNull()
    expect(sheetOrderRefusal([tied[1], ...tied.slice(0, 1), ...tied.slice(2)], 'agr', 'home')).toBeNull()
    expect(sheetOrderRefusal([lineUp[0], lineUp[2], lineUp[1], lineUp[3]], 'agr', 'away'))
      .toBe('En V, le mieux classé de l’équipe (classement 25) : c’est la règle de l’AGR.')
    expect(sheetOrderRefusal(lineUp, 'fftt', 'home')).toBeNull()
  })

  it('leaves the order free when nobody has a classement', () => {
    const unranked = [p('Léa'), p('Marc'), p('Noé'), p('Ugo')]
    expect(sheetOrderRefusal(unranked, 'agr', 'away')).toBeNull()
    expect(names(placeBestRanked(unranked, 'agr', 'away'))).toEqual(['Léa', 'Marc', 'Noé', 'Ugo'])
  })

  it('says the rule under the line-up', () => {
    expect(reservedLineNote('agr', 4)).toBe('Le mieux classé joue en A à domicile, en V à l’extérieur.')
    expect(reservedLineNote('agr', 3)).toBeNull()
  })
})
