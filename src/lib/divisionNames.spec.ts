import { describe, expect, it } from 'vitest'
import { divisionNameKey, divisionShortName, matchDivisionName } from './divisionNames'

// #647 — a calendar's division name against ours.

describe('divisionNameKey', () => {
  it('reads the AGR’s abbreviations, capitals and articles as the full name', () => {
    expect(divisionNameKey('Prom. HONNEUR')).toBe(divisionNameKey('Promotion Honneur'))
    expect(divisionNameKey('PROM. EXCELLENCE')).toBe(divisionNameKey("Promotion d'Excellence"))
    expect(divisionNameKey('EXCELLENCE')).toBe(divisionNameKey('Excellence'))
    expect(divisionNameKey('Exc.')).toBe('excellence')
    expect(divisionNameKey('PH')).toBe('promotion honneur')
  })

  it('reads a division’s number however it is written', () => {
    expect(divisionNameKey('DIVISION I')).toBe('division 1')
    expect(divisionNameKey('Div. 2')).toBe('division 2')
    expect(divisionNameKey('D2')).toBe('division 2')
    expect(divisionNameKey('Division III')).toBe('division 3')
  })

  it('takes « Division d’Honneur » for the Honneur division, and keeps the others apart', () => {
    expect(divisionNameKey("Division d'Honneur")).toBe('honneur')
    expect(divisionNameKey('Promotion Honneur')).not.toBe(divisionNameKey('Honneur'))
    expect(divisionNameKey('Promotion Excellence')).not.toBe(divisionNameKey('Excellence'))
    expect(divisionNameKey('Division 1')).not.toBe(divisionNameKey('Division 2'))
  })
})

describe('matchDivisionName', () => {
  const ours = [{ displayName: 'Excellence' }, { displayName: 'Promotion Excellence' }, { displayName: 'Promotion Honneur' }, { displayName: 'Division 1' }]
  it('finds ours, or none', () => {
    expect(matchDivisionName('Prom. HONNEUR', ours)?.displayName).toBe('Promotion Honneur')
    expect(matchDivisionName('DIVISION I', ours)?.displayName).toBe('Division 1')
    expect(matchDivisionName('Honneur', ours)).toBeUndefined()
  })
})

describe('divisionShortName (#716)', () => {
  it.each([
    ['Excellence', 'Exc.'],
    ['Promotion Excellence', 'PE'],
    ["Promotion d'Excellence", 'PE'],
    ['Honneur', 'Hon.'],
    ["Division d'Honneur", 'Hon.'],
    ['Promotion Honneur', 'PH'],
    ['Prom. HONNEUR', 'PH'],
    ['Division 1', 'D1'],
    ['DIVISION II', 'D2'],
    ['Départementale 1', 'D1'],
    ['L03_Regionale 2 Messieurs', 'R2'],
    ['Nationale 1 Messieurs', 'N1'],
    ['Pre-Nat Masculine', 'PN'],
    ['L03_Pré-Nationale Messieurs', 'PN'],
  ])('« %s » → %s', (name, short) => {
    expect(divisionShortName(name)).toBe(short)
  })

  // Every name in production and on the dev base, 13 October 2026, that is
  // not one of the above: short already, or nothing to read in it.
  it.each(['GE 6', 'GE Elite', 'Démo Division 1', 'Nationale 1 Dames'])('leaves « %s » as it is', (name) => {
    expect(divisionShortName(name)).toBe(name)
  })
})
