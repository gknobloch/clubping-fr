import { describe, expect, it } from 'vitest'
import {
  PLAYER_CATEGORIES,
  categoryDisplay,
  categoryLabel,
  normalizeCategory,
  orderedCategories,
} from './playerCategories'

describe('normalizeCategory (#482)', () => {
  it('keeps the codes FFTT actually sends', () => {
    // The three in the xml_licence_b fixture (src/lib/ffttPlayers.spec.ts).
    expect(normalizeCategory('V40')).toBe('V40')
    expect(normalizeCategory('V45')).toBe('V45')
    expect(normalizeCategory('V55')).toBe('V55')
    expect(normalizeCategory('S')).toBe('S')
  })

  it('drops the youth suffixes — FFTT runs nothing that separates them', () => {
    expect(normalizeCategory('B1')).toBe('B')
    expect(normalizeCategory('B2')).toBe('B')
    expect(normalizeCategory('J3')).toBe('J')
    expect(normalizeCategory('C1')).toBe('C')
    expect(normalizeCategory('M2')).toBe('M')
  })

  it('keeps the veteran bands apart — "vétérans 50 et plus" is a real competition', () => {
    expect(normalizeCategory('V50')).not.toBe(normalizeCategory('V60'))
  })

  it('rounds a band between two of ours DOWN: a V42 is still a V40', () => {
    expect(normalizeCategory('V42')).toBe('V40')
    expect(normalizeCategory('V99')).toBe('V90')
  })

  it('reads a bare V as the youngest band', () => {
    expect(normalizeCategory('V')).toBe('V40')
  })

  it('tolerates the way a human types it', () => {
    expect(normalizeCategory(' v45 ')).toBe('V45')
    expect(normalizeCategory('sen')).toBe('S')
  })

  it('says nothing rather than guessing, for a code we do not know', () => {
    expect(normalizeCategory('X')).toBeUndefined()
    expect(normalizeCategory('VE')).toBeUndefined()
    expect(normalizeCategory('')).toBeUndefined()
    expect(normalizeCategory(undefined)).toBeUndefined()
    expect(normalizeCategory(null)).toBeUndefined()
  })
})

describe('categoryDisplay', () => {
  it('writes the label', () => {
    expect(categoryDisplay('V45')).toBe('Vétéran 45')
    expect(categoryDisplay('S')).toBe('Senior')
  })

  it('keeps the raw code when it says more than we kept', () => {
    expect(categoryDisplay('B2')).toBe('Benjamin (B2)')
  })

  it('is empty for a member with no category', () => {
    expect(categoryDisplay(undefined)).toBe('')
    expect(categoryDisplay('X')).toBe('')
  })
})

describe('the canonical list', () => {
  it('runs youngest to oldest', () => {
    expect(PLAYER_CATEGORIES[0]).toBe('P')
    expect(PLAYER_CATEGORIES[PLAYER_CATEGORIES.length - 1]).toBe('V90')
  })

  it('labels every one of them', () => {
    for (const code of PLAYER_CATEGORIES) expect(categoryLabel(code)).not.toBe('')
    expect(orderedCategories()).toHaveLength(PLAYER_CATEGORIES.length)
  })
})
