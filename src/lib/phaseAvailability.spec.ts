import { describe, it, expect } from 'vitest'
import {
  phaseAvailabilityColumns,
  phaseAvailabilityGrid,
  playersRequired,
  selectionVerdict,
} from './phaseAvailability'
import type { Division, GameAvailability, GameSelection, Group, Player } from '@/types'

const player = (id: string, lastName: string, firstName = 'A'): Player =>
  ({ id, firstName, lastName, licenseNumber: '', phone: '', status: 'active', clubId: 'c1' }) as Player

const players = [player('p1', 'Mougey'), player('p2', 'Dangelser'), player('p3', 'Heurtin'), player('x', 'Ailleurs')]
const team = { id: 't4', playerIds: ['p1', 'p2', 'p3'] }
const games = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]

const av = (gameId: string, playerId: string, status: GameAvailability['status']): GameAvailability => ({
  gameId,
  playerId,
  status,
})

describe('phaseAvailabilityGrid', () => {
  it('lists the roster by name, one cell per match, and counts the «Oui»', () => {
    const grid = phaseAvailabilityGrid(
      team,
      games,
      players,
      [av('g1', 'p1', 'available'), av('g2', 'p1', 'maybe'), av('g3', 'p1', 'available'), av('g1', 'p2', 'unavailable')],
      [],
    )
    expect(grid.rows.map((r) => r.player.id)).toEqual(['p2', 'p3', 'p1'])
    const mougey = grid.rows[2]
    expect(mougey.cells.map((c) => c.status)).toEqual(['available', 'maybe', 'available'])
    expect(mougey.available).toBe(2)
    // No answer is the absence of a status, and it is not a yes.
    expect(grid.rows[1].cells.map((c) => c.status)).toEqual([undefined, undefined, undefined])
    expect(grid.rows[1].available).toBe(0)
    expect(grid.availableByGame).toEqual([1, 0, 1])
  })

  it('ignores answers for matches outside the phase', () => {
    const grid = phaseAvailabilityGrid(team, games, players, [av('other', 'p1', 'available')], [])
    expect(grid.rows.every((r) => r.available === 0)).toBe(true)
  })

  it('marks who the line-up names, and only this team’s line-up', () => {
    const selections: GameSelection[] = [
      { gameId: 'g2', teamId: 't4', playerIds: ['p1'] },
      { gameId: 'g2', teamId: 'opponent', playerIds: ['p2'] },
    ]
    const grid = phaseAvailabilityGrid(team, games, players, [], selections)
    const byId = Object.fromEntries(grid.rows.map((r) => [r.player.id, r]))
    expect(byId.p1.cells.map((c) => c.selected)).toEqual([false, true, false])
    expect(byId.p2.cells.some((c) => c.selected)).toBe(false)
    expect(byId.p1.selected).toBe(1)
    expect(byId.p2.selected).toBe(0)
    // The line-up's own size, per match — the opponent's does not count.
    expect(grid.selectedByGame).toEqual([0, 1, 0])
  })

  it('adds a renfort a line-up of the phase names, after the roster', () => {
    const grid = phaseAvailabilityGrid(
      team,
      games,
      players,
      [av('g3', 'x', 'available')],
      [{ gameId: 'g3', teamId: 't4', playerIds: ['p1', 'x'] }],
    )
    const last = grid.rows[grid.rows.length - 1]
    expect(last.player.id).toBe('x')
    expect(last.renfort).toBe(true)
    // Listed, answers and all — but no total, and not counted in the pool.
    expect(last.cells[2].status).toBe('available')
    expect(last.available).toBeNull()
    expect(last.selected).toBe(1)
    expect(grid.availableByGame).toEqual([0, 0, 0])
    expect(grid.rows.filter((r) => r.renfort)).toHaveLength(1)
  })
})

describe('phaseAvailabilityColumns', () => {
  it('heads each match with its journée and its own date', () => {
    const cols = phaseAvailabilityColumns([
      { id: 'g1', matchDayId: 'md1', homeTeamId: 't', awayTeamId: 'o', matchDay: { id: 'md1', groupId: 'x', number: 3, date: '2026-09-05' } },
      // A match moved off the journée's nominal date shows the date it is played.
      { id: 'g2', matchDayId: 'md2', homeTeamId: 't', awayTeamId: 'o', date: '2026-10-01', matchDay: { id: 'md2', groupId: 'x', number: 4, date: '2026-09-26' } },
    ])
    expect(cols).toEqual([
      { gameId: 'g1', number: 3, date: '5/9' },
      { gameId: 'g2', number: 4, date: '1/10' },
    ])
  })
})

describe('playersRequired', () => {
  const groups = [{ id: 'grp', divisionId: 'd', number: 1, teamIds: [], isArchived: false }] as Group[]
  const divisions = [{ id: 'd', phaseId: 'ph', displayName: 'GE 5', rank: 5, playersPerGame: 3, isArchived: false }] as Division[]

  it('reads the division the team plays in', () => {
    expect(playersRequired({ groupId: 'grp' }, groups, divisions)).toBe(3)
  })

  it('falls back to four, as the matrix does', () => {
    expect(playersRequired({ groupId: 'nowhere' }, groups, divisions)).toBe(4)
  })
})

describe('selectionVerdict', () => {
  it('wants the exact count', () => {
    expect(selectionVerdict(4, 4)).toBe('ok')
    expect(selectionVerdict(3, 4)).toBe('off')
    expect(selectionVerdict(5, 4)).toBe('off')
  })

  it('does not call a line-up nobody has started wrong', () => {
    expect(selectionVerdict(0, 4)).toBe('empty')
  })
})
