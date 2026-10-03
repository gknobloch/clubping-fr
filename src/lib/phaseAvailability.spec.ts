import { describe, it, expect } from 'vitest'
import {
  lentKeyTeam,
  phaseAvailabilityColumns,
  phaseAvailabilityGrid,
  playersRequired,
  selectionVerdict,
} from './phaseAvailability'
import type { Division, Game, GameAvailability, GameSelection, Group, MatchDay, Player, Team } from '@/types'

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

  it('gathers the renforts of each line-up apart from the roster', () => {
    const grid = phaseAvailabilityGrid(
      team,
      games,
      [...players, player('y', 'Bertrand')],
      [av('g3', 'x', 'available')],
      [
        { gameId: 'g1', teamId: 't4', playerIds: ['p1'] },
        { gameId: 'g3', teamId: 't4', playerIds: ['p1', 'x', 'y'] },
      ],
    )
    // The roster only: a renfort is not a row.
    expect(grid.rows.map((r) => r.player.id)).toEqual(['p2', 'p3', 'p1'])
    expect(grid.renforts.map((list) => list.map((p) => p.id))).toEqual([[], [], ['x', 'y']])
    expect(grid.renfortGames).toBe(1)
    // A renfort's yes is not the pool; their place on the line-up is.
    expect(grid.availableByGame).toEqual([0, 0, 0])
    expect(grid.selectedByGame).toEqual([1, 0, 3])
  })
})

describe('phaseAvailabilityGrid — lent to another team of the club', () => {
  const md = (id: string, groupId: string, number: number) => ({ id, groupId, number, date: '2026-10-0' + number })
  const t = (id: string, number: number, extra: Partial<Team> = {}) =>
    ({ id, clubId: 'c1', phaseId: 'ph1', number, groupId: `grp-${id}`, playerIds: [], ...extra }) as Team
  const four = t('t4', 4, { playerIds: ['p1', 'p2', 'p3'] })
  const three = t('t3', 3)
  const otherPhase = t('t3-old', 3, { phaseId: 'ph0' })
  const otherClub = t('x3', 3, { clubId: 'c2' })
  const matchDays = [md('a1', 'grp-t4', 1), md('a2', 'grp-t4', 2), md('b1', 'grp-t3', 1), md('b2', 'grp-t3', 2)]
  const ourGames = [
    { id: 'g1', matchDay: matchDays[0] },
    { id: 'g2', matchDay: matchDays[1] },
  ]
  const allGames = [
    { id: 'g1', matchDayId: 'a1', homeTeamId: 't4', awayTeamId: 'o' },
    { id: 'g2', matchDayId: 'a2', homeTeamId: 't4', awayTeamId: 'o' },
    { id: 'h2', matchDayId: 'b2', homeTeamId: 't3', awayTeamId: 'o' },
  ] as Game[]
  const club = { teams: [four, three, otherPhase, otherClub], games: allGames, matchDays: matchDays as MatchDay[] }

  it('marks a roster player another team fields on the same journée, and counts it', () => {
    const grid = phaseAvailabilityGrid(four, ourGames, players, [], [
      { gameId: 'g1', teamId: 't4', playerIds: ['p1'] },
      { gameId: 'h2', teamId: 't3', playerIds: ['p1', 'p2'] },
    ], club)
    const byId = Object.fromEntries(grid.rows.map((r) => [r.player.id, r]))
    expect(byId.p1.cells.map((c) => c.lentTo?.id)).toEqual([undefined, 't3'])
    // Here on J1, lent on J2: two journées played for the club.
    expect(byId.p1.selected).toBe(2)
    expect(byId.p2.selected).toBe(1)
    // The line-up totals stay this team's own.
    expect(grid.selectedByGame).toEqual([1, 0])
  })

  it('leaves a lent player out of the pool, whatever they answered', () => {
    const grid = phaseAvailabilityGrid(
      four, ourGames, players,
      [av('g2', 'p1', 'available'), av('g2', 'p2', 'available')],
      [{ gameId: 'h2', teamId: 't3', playerIds: ['p1'] }],
      club,
    )
    expect(grid.availableByGame).toEqual([0, 1])
    // Their answer is still theirs: the ratio is about them, not the pool.
    expect(grid.rows.find((r) => r.player.id === 'p1')!.available).toBe(1)
  })

  it('gives the key the badge of a team the players were lent to', () => {
    const grid = phaseAvailabilityGrid(four, ourGames, players, [], [
      { gameId: 'h2', teamId: 't3', playerIds: ['p2'] },
    ], club)
    expect(lentKeyTeam(grid, four, club.teams)).toMatchObject({ id: 't3', number: 3 })
  })

  it('falls back on another team of the club in the phase, then on «1»', () => {
    const grid = phaseAvailabilityGrid(four, ourGames, players, [], [], club)
    expect(lentKeyTeam(grid, four, club.teams)).toMatchObject({ id: 't3' })
    expect(lentKeyTeam(grid, four, [four])).toEqual({ number: 1 })
  })

  it('says nothing without the club, as the grid of one team', () => {
    const grid = phaseAvailabilityGrid(four, ourGames, players, [], [
      { gameId: 'h2', teamId: 't3', playerIds: ['p1'] },
    ])
    expect(grid.rows.every((r) => r.cells.every((c) => !c.lentTo))).toBe(true)
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
