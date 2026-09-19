import { describe, it, expect } from 'vitest'
import { gameAxisFromParam, gameAxisSteps, gameNeighbours } from './gameNeighbours'
import type { Team, Phase, MatchDay, Game } from '@/types'

const makeTeam = (
  overrides: Partial<Team> & { id: string; clubId: string; number: number; phaseId: string; groupId: string },
): Team => ({
  divisionId: 'div-1',
  gameLocationId: 'addr-1',
  defaultDay: 'Samedi',
  defaultTime: '17h00',
  captainId: '',
  playerIds: [],
  isArchived: false,
  ...overrides,
})

const makePhase = (id: string, displayName: string, status: Phase['status'] = 'active'): Phase => ({
  id,
  seasonId: 'season-1',
  name: displayName,
  displayName,
  status,
})

const makeMatchDay = (id: string, groupId: string, number: number, date: string): MatchDay => ({
  id, groupId, number, date,
})

const makeGame = (
  id: string, matchDayId: string, homeTeamId: string, awayTeamId = 'opp', date?: string,
): Game => ({ id, matchDayId, homeTeamId, awayTeamId, ...(date ? { date } : {}) })

// A club with three teams, each in its own poule, each playing rounds 1 and 2.
// Journée N is three MatchDay rows, one per group — the shape that makes the
// round axis worth deriving rather than filtering on a number.
function club() {
  const teams = [
    makeTeam({ id: 't1', clubId: 'c1', number: 1, phaseId: 'ph1', groupId: 'g1' }),
    makeTeam({ id: 't2', clubId: 'c1', number: 2, phaseId: 'ph1', groupId: 'g2' }),
    makeTeam({ id: 't3', clubId: 'c1', number: 3, phaseId: 'ph1', groupId: 'g3' }),
  ]
  const phases = [makePhase('ph1', '2025/2026 Phase 1')]
  const matchDays = [
    makeMatchDay('md-g1-j1', 'g1', 1, '2025-09-06'),
    makeMatchDay('md-g2-j1', 'g2', 1, '2025-09-06'),
    makeMatchDay('md-g3-j1', 'g3', 1, '2025-09-06'),
    makeMatchDay('md-g1-j2', 'g1', 2, '2025-09-13'),
    makeMatchDay('md-g2-j2', 'g2', 2, '2025-09-13'),
  ]
  const games = [
    makeGame('j1-t1', 'md-g1-j1', 't1'),
    makeGame('j1-t2', 'md-g2-j1', 'opp2', 't2'),
    makeGame('j1-t3', 'md-g3-j1', 't3'),
    makeGame('j2-t1', 'md-g1-j2', 't1'),
    makeGame('j2-t2', 'md-g2-j2', 'opp2', 't2'),
  ]
  return { teams, phases, matchDays, games }
}

describe('gameNeighbours — the round axis', () => {
  it('walks the club’s teams in number order', () => {
    const data = club()

    const n = gameNeighbours({ gameId: 'j1-t2', teamId: 't2' }, 'round', data)

    expect(n).toMatchObject({ axis: 'round', index: 1, total: 3 })
    expect(n?.previous).toMatchObject({ gameId: 'j1-t1', teamId: 't1', teamNumber: 1, matchDayNumber: 1 })
    expect(n?.next).toMatchObject({ gameId: 'j1-t3', teamId: 't3', teamNumber: 3, matchDayNumber: 1 })
  })

  it('has no previous at the first team and no next at the last', () => {
    const data = club()

    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'round', data)?.previous).toBeUndefined()
    expect(gameNeighbours({ gameId: 'j1-t3', teamId: 't3' }, 'round', data)?.next).toBeUndefined()
  })

  it('skips a team that sits the round out', () => {
    const data = club()

    // Équipe 3 has no journée 2: the axis is Équipe 1 then Équipe 2.
    const n = gameNeighbours({ gameId: 'j2-t1', teamId: 't1' }, 'round', data)

    expect(n).toMatchObject({ index: 0, total: 2 })
    expect(n?.next).toMatchObject({ teamId: 't2' })
  })

  it('stays within the phase when another one numbers its journées from 1 again', () => {
    const data = club()
    data.teams.push(makeTeam({ id: 't1-p2', clubId: 'c1', number: 1, phaseId: 'ph2', groupId: 'g9' }))
    data.phases.push(makePhase('ph2', '2025/2026 Phase 2', 'upcoming'))
    data.matchDays.push(makeMatchDay('md-g9-j1', 'g9', 1, '2026-01-10'))
    data.games.push(makeGame('p2-j1-t1', 'md-g9-j1', 't1-p2'))

    const n = gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'round', data)

    expect(n?.total).toBe(3)
  })

  it('ignores another club playing the same round', () => {
    const data = club()
    data.teams.push(makeTeam({ id: 'x1', clubId: 'c2', number: 1, phaseId: 'ph1', groupId: 'g1' }))
    data.games.push(makeGame('j1-x1', 'md-g1-j1', 'x1'))

    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'round', data)?.total).toBe(3)
  })
})

describe('gameNeighbours — the team axis', () => {
  it('walks the team’s phase in date order', () => {
    const data = club()

    const n = gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'team', data)

    expect(n).toMatchObject({ axis: 'team', index: 0, total: 2 })
    expect(n?.previous).toBeUndefined()
    expect(n?.next).toMatchObject({ gameId: 'j2-t1', teamId: 't1', matchDayNumber: 2, teamNumber: 1 })
  })

  it('orders on the game’s own date, not on insertion', () => {
    const data = club()
    // A journée 2 fixture moved before journée 1's — games own their date.
    data.games = data.games.map((g) => (g.id === 'j2-t1' ? { ...g, date: '2025-09-01' } : g))

    const n = gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'team', data)

    expect(n?.index).toBe(1)
    expect(n?.previous).toMatchObject({ gameId: 'j2-t1' })
  })

  it('stays on the team record of the phase, not its other seasons', () => {
    const data = club()
    data.teams.push(makeTeam({ id: 't1-p2', clubId: 'c1', number: 1, phaseId: 'ph2', groupId: 'g9' }))
    data.phases.push(makePhase('ph2', '2025/2026 Phase 2', 'upcoming'))
    data.matchDays.push(makeMatchDay('md-g9-j1', 'g9', 1, '2026-01-10'))
    data.games.push(makeGame('p2-j1-t1', 'md-g9-j1', 't1-p2'))

    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'team', data)?.total).toBe(2)
  })
})

describe('gameNeighbours — nothing to page through', () => {
  it('is null when the axis holds this fixture alone', () => {
    const data = club()

    expect(gameNeighbours({ gameId: 'j1-t3', teamId: 't3' }, 'team', data)).toBeNull()
  })

  it('is null for a fixture the team does not play', () => {
    const data = club()

    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 't2' }, 'round', data)).toBeNull()
  })

  it('is null when the fixture, the team or its match-day is unknown', () => {
    const data = club()

    expect(gameNeighbours({ gameId: 'nope', teamId: 't1' }, 'team', data)).toBeNull()
    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 'nope' }, 'team', data)).toBeNull()
    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'team', { ...data, matchDays: [] })).toBeNull()
  })
})

describe('gameAxisSteps — the list a rail prints', () => {
  // The tablet's «Journée X» lists these rows and the pager picks the two
  // either side of the current one (#585). Same derivation on purpose: two
  // would eventually disagree about an exempt team, and the rail and the
  // swipe would then hold different calendars.
  it('is the whole axis, in the order the pager walks it', () => {
    const data = club()

    const steps = gameAxisSteps({ gameId: 'j1-t2', teamId: 't2' }, 'round', data)

    expect(steps.map((s) => s.teamId)).toEqual(['t1', 't2', 't3'])
    const n = gameNeighbours({ gameId: 'j1-t2', teamId: 't2' }, 'round', data)
    expect(steps[n!.index - 1]).toEqual(n!.previous)
    expect(steps[n!.index + 1]).toEqual(n!.next)
    expect(steps).toHaveLength(n!.total)
  })

  it('keeps the one stop the pager refuses to page', () => {
    // `gameNeighbours` returns null on a one-stop axis — a control that cannot
    // move is one nobody should see. A rail still has a row to draw.
    const data = club()
    data.games = data.games.filter((g) => g.id === 'j1-t1')

    expect(gameNeighbours({ gameId: 'j1-t1', teamId: 't1' }, 'round', data)).toBeNull()
    expect(gameAxisSteps({ gameId: 'j1-t1', teamId: 't1' }, 'round', data)).toHaveLength(1)
  })

  it('is empty when the fixture is unknown', () => {
    expect(gameAxisSteps({ gameId: 'nope', teamId: 't1' }, 'round', club())).toEqual([])
  })
})

describe('gameAxisFromParam', () => {
  it('reads the axis a caller named', () => {
    expect(gameAxisFromParam('round')).toBe('round')
    expect(gameAxisFromParam('team')).toBe('team')
  })

  it('falls back to the team’s phase, the one axis always there', () => {
    // Shared with the tab bar (#552), which lights Équipes on the strength of
    // this: the accueil's next match, Mes matchs and a push notification name
    // no axis, and all three are a team's own calendar.
    expect(gameAxisFromParam(undefined)).toBe('team')
    expect(gameAxisFromParam('')).toBe('team')
    expect(gameAxisFromParam('nonsense')).toBe('team')
  })
})
