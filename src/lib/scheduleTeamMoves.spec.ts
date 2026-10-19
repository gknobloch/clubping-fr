import { describe, expect, it } from 'vitest'
import { teamsLeavingTheirPoule, type PlacedTeam } from './scheduleTeamMoves'

const teams: PlacedTeam[] = [
  { id: 't-benfeld-2', clubId: 'benfeld', number: 2, groupId: 'g-haut-rhin' },
  { id: 't-benfeld-1', clubId: 'benfeld', number: 1, groupId: 'g-pe' },
  { id: 't-eschau-3', clubId: 'eschau', number: 3, groupId: 'g-bas-rhin' },
  { id: 't-barr-1', clubId: 'barr', number: 1, groupId: '' },
]
const sides = [
  { clubId: 'benfeld', number: 2 }, { clubId: 'eschau', number: 3 }, { clubId: 'barr', number: 1 }, { clubId: 'new', number: 1 },
]

describe('teamsLeavingTheirPoule (#763)', () => {
  it('names the teams the calendar finds again in another poule — by club and number, not by club', () => {
    expect(teamsLeavingTheirPoule(sides, teams, 'g-bas-rhin').map((t) => t.id)).toEqual(['t-benfeld-2'])
  })

  it('takes every team found again out of its poule when the poule is still to be created', () => {
    expect(teamsLeavingTheirPoule(sides, teams, null).map((t) => t.id)).toEqual(['t-benfeld-2', 't-eschau-3'])
  })

  it('moves nobody when the calendar is imported again into the same poule', () => {
    expect(teamsLeavingTheirPoule(sides.slice(1, 2), teams, 'g-bas-rhin')).toEqual([])
  })
})
