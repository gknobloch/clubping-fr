import { describe, expect, it } from 'vitest'
import {
  canMoveDivisionDown,
  canMoveDivisionUp,
  divisionDisplayName,
  ffttIdFromIri,
  isFfttContestIdentifier,
  orderDivisions,
  playersPerGameFor,
  type FfttDivision,
} from './ffttDivisions'

const d = (id: string, identifier: string, parentId: string | null): FfttDivision => ({
  id,
  identifier,
  name: identifier,
  parentId,
})

describe('ffttIdFromIri', () => {
  it('extracts the numeric id', () => {
    expect(ffttIdFromIri('/api/divisions/234020')).toBe('234020')
    expect(ffttIdFromIri('/api/contests/18368')).toBe('18368')
  })
})

describe('playersPerGameFor', () => {
  it('returns the default for regular divisions', () => {
    expect(playersPerGameFor('GEEP1')).toBe(4)
    expect(playersPerGameFor('GE3P1')).toBe(4)
  })

  it('applies the GE7 override for both phases', () => {
    expect(playersPerGameFor('GE7P1')).toBe(3)
    expect(playersPerGameFor('GE7P2')).toBe(3)
  })
})

describe('orderDivisions', () => {
  it('orders the real GRAND-EST phase 1 shape: chain first, orphan root last', () => {
    // Actual data returned by FFTT for contest 18368 / phase 1 (season 27).
    const divisions = [
      d('234020', 'GE3P1', '234461'),
      d('234142', 'GEEP1', null),
      d('234149', 'GE6P1', '234600'),
      d('234322', 'GE1P1', '234142'),
      d('234461', 'GE2P1', '234322'),
      d('234527', 'GE4P1', '234020'),
      d('234600', 'GE5P1', '234527'),
      d('234612', 'GE7P1', null),
    ]
    expect(orderDivisions(divisions).map((x) => x.identifier)).toEqual([
      'GEEP1', 'GE1P1', 'GE2P1', 'GE3P1', 'GE4P1', 'GE5P1', 'GE6P1', 'GE7P1',
    ])
  })

  it('appends nodes whose parent is missing from the list', () => {
    const divisions = [
      d('2', 'B', '1'),
      d('1', 'A', null),
      d('9', 'Z', 'not-in-list'),
    ]
    expect(orderDivisions(divisions).map((x) => x.identifier)).toEqual(['A', 'B', 'Z'])
  })

  it('sorts sibling roots and children deterministically by identifier', () => {
    const divisions = [
      d('3', 'R2', null),
      d('1', 'R1', null),
      d('2', 'R1-child', '1'),
      d('4', 'R2-child', '3'),
    ]
    expect(orderDivisions(divisions).map((x) => x.identifier)).toEqual([
      'R1', 'R1-child', 'R2', 'R2-child',
    ])
  })

  it('survives a parent cycle without dropping nodes', () => {
    const divisions = [
      d('1', 'A', '2'),
      d('2', 'B', '1'),
    ]
    const ordered = orderDivisions(divisions)
    expect(ordered).toHaveLength(2)
    expect(new Set(ordered.map((x) => x.id))).toEqual(new Set(['1', '2']))
  })

  it('returns an empty list unchanged', () => {
    expect(orderDivisions([])).toEqual([])
  })
})

describe('canMoveDivisionUp / canMoveDivisionDown', () => {
  // Ranked A, B, C — B is A's child; C has no parent.
  const a = { id: 'a' }
  const b = { id: 'b', parentId: 'a' }
  const c = { id: 'c' }
  const inPhase = [a, b, c]

  it('blocks the top of the list from moving up, and the bottom from moving down', () => {
    expect(canMoveDivisionUp(a, inPhase)).toBe(false)
    expect(canMoveDivisionDown(c, inPhase)).toBe(false)
  })

  it('blocks a child from moving above its own parent', () => {
    expect(canMoveDivisionUp(b, inPhase)).toBe(false)
  })

  it('blocks a parent from moving below its own child', () => {
    expect(canMoveDivisionDown(a, inPhase)).toBe(false)
  })

  it('allows moves that do not cross the parent/child boundary', () => {
    expect(canMoveDivisionUp(c, inPhase)).toBe(true) // swaps with b, not its parent
    expect(canMoveDivisionDown(b, inPhase)).toBe(true) // swaps with c, not its child
  })

  it('returns false for a division not in the list', () => {
    expect(canMoveDivisionUp({ id: 'missing' }, inPhase)).toBe(false)
    expect(canMoveDivisionDown({ id: 'missing' }, inPhase)).toBe(false)
  })
})

describe('divisionDisplayName', () => {
  it('strips the long "Phase N" marker FFTT puts on numbered divisions', () => {
    expect(divisionDisplayName('GE 3 Phase 1')).toBe('GE 3')
    expect(divisionDisplayName('GE 7 Phase 2')).toBe('GE 7')
  })

  it('strips the short "PN" marker used by the Elite division', () => {
    expect(divisionDisplayName('GE Elite P1')).toBe('GE Elite')
    expect(divisionDisplayName('GE Elite P2')).toBe('GE Elite')
  })

  it('strips the underscored "_PhN" marker used by the league divisions', () => {
    expect(divisionDisplayName('L03_Regionale 1 Messieurs_Ph1')).toBe('L03_Regionale 1 Messieurs')
    expect(divisionDisplayName('L03_Pré-Nationale Messieurs_Ph1')).toBe('L03_Pré-Nationale Messieurs')
  })

  it('strips the marker from the national divisions too', () => {
    expect(divisionDisplayName('Nationale 1 Messieurs Phase 1')).toBe('Nationale 1 Messieurs')
  })

  it('keeps a name whose trailing number is the division’s own', () => {
    expect(divisionDisplayName('GE 3')).toBe('GE 3')
    expect(divisionDisplayName('GE Elite')).toBe('GE Elite')
    expect(divisionDisplayName('Régionale 2')).toBe('Régionale 2')
    expect(divisionDisplayName('Nationale 3 Messieurs')).toBe('Nationale 3 Messieurs')
    expect(divisionDisplayName('Pre-Nat Masculine')).toBe('Pre-Nat Masculine')
    expect(divisionDisplayName('GEE')).toBe('GEE')
  })

  it('is idempotent and trims, so re-importing never erodes a name', () => {
    expect(divisionDisplayName(divisionDisplayName('GE 3 Phase 1'))).toBe('GE 3')
    expect(divisionDisplayName('  GE 3 Phase 1  ')).toBe('GE 3')
  })

  it('leaves names with no marker alone', () => {
    expect(divisionDisplayName('Division 234020')).toBe('Division 234020')
    expect(divisionDisplayName('')).toBe('')
  })
})

// #482 — the contest identifier is the first value from a request that reaches
// an FFTT GraphQL query as text, and it lands inside a string literal. Escaping
// and hoping is not the plan: the shape is narrowed to what FFTT issues.
describe('isFfttContestIdentifier', () => {
  it('accepts the identifiers FFTT issues', () => {
    expect(isFfttContestIdentifier('1')).toBe(true)
    expect(isFfttContestIdentifier('CJ')).toBe(true)
    expect(isFfttContestIdentifier('D1_M')).toBe(true)
  })

  it('refuses anything that could end the string literal it goes into', () => {
    expect(isFfttContestIdentifier('1" name: "x')).toBe(false)
    expect(isFfttContestIdentifier('1\\')).toBe(false)
    expect(isFfttContestIdentifier('a b')).toBe(false)
    expect(isFfttContestIdentifier('{')).toBe(false)
  })

  it('refuses what is empty, oversized, or not a string at all', () => {
    expect(isFfttContestIdentifier('')).toBe(false)
    expect(isFfttContestIdentifier('x'.repeat(21))).toBe(false)
    expect(isFfttContestIdentifier(1)).toBe(false)
    expect(isFfttContestIdentifier(undefined)).toBe(false)
  })
})
