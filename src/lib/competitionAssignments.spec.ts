import { describe, it, expect } from 'vitest'
import type { Competition, Division, GameSelection, Team } from '@/types'
import { assignmentsByPlayer, assignmentSummary } from './competitionAssignments'

// #482 — the contradiction an exclusion leaves behind. Eligibility never
// removes anyone from a squad, so the screens have to say when a "non éligible"
// is in fact already playing.

const youth: Competition = {
  id: 'comp-jeunes', displayName: 'Jeunes', categories: ['B', 'M', 'C', 'J'],
  isCategoryLocked: true, sortOrder: 1, isArchived: false,
}
const seniors: Competition = {
  id: 'comp-seniors', displayName: 'Seniors', categories: [],
  isCategoryLocked: false, sortOrder: 2, isArchived: false,
}

const divisions = [
  { id: 'div-youth', competitionId: 'comp-jeunes' },
  { id: 'div-senior', competitionId: 'comp-seniors' },
  { id: 'div-orphan' },
] as Division[]

const team = (id: string, number: number, divisionId: string, playerIds: string[], isArchived = false) =>
  ({ id, number, divisionId, playerIds, isArchived, clubId: 'club-1' } as Team)

const ctx = (over: Partial<Parameters<typeof assignmentsByPlayer>[1]> = {}) => ({
  teams: [
    team('t6', 6, 'div-youth', ['p-cadet', 'p-senior']),
    team('t7', 7, 'div-youth', ['p-cadet']),
    team('t1', 1, 'div-senior', ['p-senior']),
  ],
  divisions,
  competitions: [youth, seniors],
  gameSelections: [] as GameSelection[],
  ...over,
})

describe('assignmentsByPlayer', () => {
  it('lists the teams of that competition only, in order', () => {
    const map = assignmentsByPlayer('comp-jeunes', ctx())
    expect(map.get('p-cadet')?.teamNumbers).toEqual([6, 7])
    // The senior team is another competition's, so it does not show here.
    expect(map.get('p-senior')?.teamNumbers).toEqual([6])
    expect(assignmentsByPlayer('comp-seniors', ctx()).get('p-senior')?.teamNumbers).toEqual([1])
  })

  it('ignores an archived team — a finished squad is history, not an engagement', () => {
    const map = assignmentsByPlayer('comp-jeunes', ctx({
      teams: [team('t6', 6, 'div-youth', ['p-cadet'], true)],
    }))
    expect(map.size).toBe(0)
  })

  it('ignores a division filed under nothing', () => {
    const map = assignmentsByPlayer('comp-jeunes', ctx({
      teams: [team('t9', 9, 'div-orphan', ['p-cadet'])],
    }))
    expect(map.size).toBe(0)
  })

  it('ignores a division whose competition is archived', () => {
    const map = assignmentsByPlayer('comp-jeunes', ctx({
      competitions: [{ ...youth, isArchived: true }, seniors],
    }))
    expect(map.size).toBe(0)
  })

  it('counts one line-up per rencontre, and only for its own competition', () => {
    const map = assignmentsByPlayer('comp-jeunes', ctx({
      gameSelections: [
        { gameId: 'g1', teamId: 't6', playerIds: ['p-cadet'] },
        { gameId: 'g2', teamId: 't6', playerIds: ['p-cadet'] },
        { gameId: 'g3', teamId: 't1', playerIds: ['p-cadet'] },
      ],
    }))
    expect(map.get('p-cadet')?.lineups).toBe(2)
  })

  it('reports a player named nowhere as absent from the map', () => {
    expect(assignmentsByPlayer('comp-jeunes', ctx()).get('p-nobody')).toBeUndefined()
  })
})

describe('assignmentSummary', () => {
  it('says nothing when there is nothing to say', () => {
    expect(assignmentSummary(undefined)).toBeNull()
    expect(assignmentSummary({ teamNumbers: [], lineups: 0 })).toBeNull()
  })

  it('reads as a sentence, singular and plural alike', () => {
    expect(assignmentSummary({ teamNumbers: [6], lineups: 0 })).toBe("Déjà dans l'équipe 6")
    expect(assignmentSummary({ teamNumbers: [6, 7], lineups: 0 })).toBe('Déjà dans les équipes 6 et 7')
    expect(assignmentSummary({ teamNumbers: [3, 6, 7], lineups: 0 })).toBe('Déjà dans les équipes 3, 6 et 7')
    expect(assignmentSummary({ teamNumbers: [], lineups: 1 })).toBe('Déjà aligné sur 1 rencontre')
    expect(assignmentSummary({ teamNumbers: [6], lineups: 2 }))
      .toBe("Déjà dans l'équipe 6 et aligné sur 2 rencontres")
  })
})
