import { describe, it, expect } from 'vitest'
import { teamPhaseEntries } from './teamPhases'
import type { Team, Phase, MatchDay, Game } from '@/types'

const makeTeam = (overrides: Partial<Team> & { id: string; clubId: string; number: number; phaseId: string; groupId: string }): Team => ({
  divisionId: 'div-1',
  gameLocationId: 'addr-1',
  defaultDay: 'Jeudi',
  defaultTime: '20h00',
  captainId: '',
  playerIds: [],
  isArchived: false,
  ...overrides,
})

const makePhase = (overrides: Partial<Phase> & { id: string; displayName: string }): Phase => ({
  seasonId: 'season-1',
  name: overrides.displayName,
  status: 'upcoming',
  ...overrides,
})

const makeMatchDay = (id: string, groupId: string, date: string, number = 1): MatchDay => ({
  id,
  groupId,
  number,
  date,
})

const makeGame = (id: string, matchDayId: string, homeTeamId: string, awayTeamId = 'opp'): Game => ({
  id,
  matchDayId,
  homeTeamId,
  awayTeamId,
})

describe('teamPhaseEntries', () => {
  it('returns one entry for a single phase, with games sorted by date ascending', () => {
    const teams = [makeTeam({ id: 'team-1', clubId: 'club-1', number: 1, phaseId: 'phase-1', groupId: 'group-1' })]
    const phases = [makePhase({ id: 'phase-1', displayName: '2025/2026 Phase 1', status: 'active' })]
    const matchDays = [
      makeMatchDay('md-1', 'group-1', '2025-09-08', 2),
      makeMatchDay('md-2', 'group-1', '2025-09-01', 1),
    ]
    // Inserted out of date order to verify the sort, not just insertion order.
    const games = [makeGame('g-1', 'md-1', 'team-1'), makeGame('g-2', 'md-2', 'team-1')]

    const entries = teamPhaseEntries({ clubId: 'club-1', number: 1 }, teams, phases, matchDays, games)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      teamId: 'team-1',
      phaseId: 'phase-1',
      label: 'Saison 2025/2026 Phase 1',
      isActive: true,
    })
    expect(entries[0].games.map((g) => g.id)).toEqual(['g-2', 'g-1'])
  })

  it('filters out a phase with no games', () => {
    const teams = [makeTeam({ id: 'team-1', clubId: 'club-1', number: 1, phaseId: 'phase-1', groupId: 'group-1' })]
    const phases = [makePhase({ id: 'phase-1', displayName: '2025/2026 Phase 1' })]

    const entries = teamPhaseEntries({ clubId: 'club-1', number: 1 }, teams, phases, [], [])

    expect(entries).toEqual([])
  })

  it('includes phases with no games when requested', () => {
    const teams = [makeTeam({ id: 'team-1', clubId: 'club-1', number: 1, phaseId: 'phase-1', groupId: 'group-1' })]
    const phases = [makePhase({ id: 'phase-1', displayName: '2026/2027 Phase 1', status: 'active' })]

    const entries = teamPhaseEntries(
      { clubId: 'club-1', number: 1 }, teams, phases, [], [], { includeEmpty: true },
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ teamId: 'team-1', phaseId: 'phase-1', games: [] })
  })

  it('only counts games whose match-day is in the team-record\'s own group', () => {
    const teams = [makeTeam({ id: 'team-1', clubId: 'club-1', number: 1, phaseId: 'phase-1', groupId: 'group-1' })]
    const phases = [makePhase({ id: 'phase-1', displayName: '2025/2026 Phase 1' })]
    const matchDays = [
      makeMatchDay('md-1', 'group-1', '2025-09-01'),
      makeMatchDay('md-other', 'group-other', '2025-09-08'),
    ]
    // g-1's match-day is in the team's group; g-2 references a team match but
    // its match-day belongs to a different group and should be excluded.
    const games = [makeGame('g-1', 'md-1', 'team-1'), makeGame('g-2', 'md-other', 'team-1')]

    const entries = teamPhaseEntries({ clubId: 'club-1', number: 1 }, teams, phases, matchDays, games)

    expect(entries[0].games.map((g) => g.id)).toEqual(['g-1'])
  })

  it('ignores team records for a different club or a different team number', () => {
    const teams = [
      makeTeam({ id: 'team-1', clubId: 'club-1', number: 1, phaseId: 'phase-1', groupId: 'group-1' }),
      makeTeam({ id: 'team-2', clubId: 'club-1', number: 2, phaseId: 'phase-1', groupId: 'group-2' }),
      makeTeam({ id: 'team-other-club', clubId: 'club-2', number: 1, phaseId: 'phase-1', groupId: 'group-3' }),
    ]
    const phases = [makePhase({ id: 'phase-1', displayName: '2025/2026 Phase 1' })]
    const matchDays = [
      makeMatchDay('md-1', 'group-1', '2025-09-01'),
      makeMatchDay('md-2', 'group-2', '2025-09-01'),
      makeMatchDay('md-3', 'group-3', '2025-09-01'),
    ]
    const games = [
      makeGame('g-1', 'md-1', 'team-1'),
      makeGame('g-2', 'md-2', 'team-2'),
      makeGame('g-3', 'md-3', 'team-other-club'),
    ]

    const entries = teamPhaseEntries({ clubId: 'club-1', number: 1 }, teams, phases, matchDays, games)

    expect(entries).toHaveLength(1)
    expect(entries[0].teamId).toBe('team-1')
  })

  it('falls back to a "Matchs" label when the phase record can\'t be resolved', () => {
    const teams = [makeTeam({ id: 'team-1', clubId: 'club-1', number: 1, phaseId: 'missing-phase', groupId: 'group-1' })]
    const matchDays = [makeMatchDay('md-1', 'group-1', '2025-09-01')]
    const games = [makeGame('g-1', 'md-1', 'team-1')]

    const entries = teamPhaseEntries({ clubId: 'club-1', number: 1 }, teams, [], matchDays, games)

    expect(entries[0]).toMatchObject({ label: 'Matchs', isActive: false })
  })

  it('orders the active phase first, then non-active phases by most-recent label', () => {
    const teams = [
      makeTeam({ id: 'team-a', clubId: 'club-1', number: 1, phaseId: 'phase-a', groupId: 'group-a' }),
      makeTeam({ id: 'team-b', clubId: 'club-1', number: 1, phaseId: 'phase-b', groupId: 'group-b' }),
      makeTeam({ id: 'team-c', clubId: 'club-1', number: 1, phaseId: 'phase-c', groupId: 'group-c' }),
    ]
    const phases = [
      makePhase({ id: 'phase-a', displayName: '2024/2025 Phase 1', status: 'upcoming' }),
      makePhase({ id: 'phase-b', displayName: '2025/2026 Phase 1', status: 'upcoming' }),
      // Textually "smallest" label but active — should still sort first.
      makePhase({ id: 'phase-c', displayName: '2023/2024 Phase 1', status: 'active' }),
    ]
    const matchDays = [
      makeMatchDay('md-a', 'group-a', '2024-09-01'),
      makeMatchDay('md-b', 'group-b', '2025-09-01'),
      makeMatchDay('md-c', 'group-c', '2023-09-01'),
    ]
    const games = [
      makeGame('g-a', 'md-a', 'team-a'),
      makeGame('g-b', 'md-b', 'team-b'),
      makeGame('g-c', 'md-c', 'team-c'),
    ]

    const entries = teamPhaseEntries({ clubId: 'club-1', number: 1 }, teams, phases, matchDays, games)

    expect(entries.map((e) => e.phaseId)).toEqual(['phase-c', 'phase-b', 'phase-a'])
  })
})
