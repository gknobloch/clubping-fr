import { describe, it, expect } from 'vitest'
import { canSeeArchivedPlayers, selectablePlayers, visiblePlayers } from './playerVisibility'

const roster = [
  { id: 'p1', status: 'active' },
  { id: 'p2', status: 'archived' },
  { id: 'p3', status: 'active' },
]

describe('canSeeArchivedPlayers (#438)', () => {
  it('admits the two admin roles', () => {
    expect(canSeeArchivedPlayers('general_admin')).toBe(true)
    expect(canSeeArchivedPlayers('club_admin')).toBe(true)
  })

  it('excludes a plain member, and anyone not signed in', () => {
    expect(canSeeArchivedPlayers('player')).toBe(false)
    expect(canSeeArchivedPlayers(undefined)).toBe(false)
  })
})

describe('visiblePlayers (#438)', () => {
  it('hides the archived ones by default, for an admin too', () => {
    for (const role of ['general_admin', 'club_admin', 'player', undefined]) {
      expect(visiblePlayers(roster, { role, activeOnly: true }).map((p) => p.id)).toEqual([
        'p1',
        'p3',
      ])
    }
  })

  it('shows them to an admin who turns the toggle off', () => {
    expect(
      visiblePlayers(roster, { role: 'club_admin', activeOnly: false }).map((p) => p.id),
    ).toEqual(['p1', 'p2', 'p3'])
  })

  // A member has no toggle to turn off, but the rule must not depend on the UI
  // remembering that — a stale `false` in state stays a list of active players.
  it('keeps a member on the active roster even with the flag off', () => {
    expect(
      visiblePlayers(roster, { role: 'player', activeOnly: false }).map((p) => p.id),
    ).toEqual(['p1', 'p3'])
  })
})

describe('selectablePlayers (#454)', () => {
  const p = (id: string, status: string) => ({ id, status })

  it('drops archived players', () => {
    expect(selectablePlayers([p('1', 'active'), p('2', 'archived')], []).map((x) => x.id)).toEqual([
      '1',
    ])
  })

  it('keeps an archived player who is already in the line-up', () => {
    expect(
      selectablePlayers([p('1', 'active'), p('2', 'archived')], ['2']).map((x) => x.id),
    ).toEqual(['1', '2'])
  })

  it('returns an empty list for an empty input', () => {
    expect(selectablePlayers([], ['1'])).toEqual([])
  })
})
