import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Club, DataState, Division, Group, Phase, Player, Season, Team } from '@/types'
import { DataProvider, useAppData } from '@/contexts/DataContext'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ token: null, logout: vi.fn() }),
}))

// Two groups in the same division, each with one journée of one game, so the
// assertions can tell "cleared the target group" apart from "cleared
// everything" (#270). Group 2 is the control.
const season: Season = { id: '26', displayName: '2025/2026', status: 'active' }
const phase: Phase = {
  id: 'phase-26-1', seasonId: '26', name: 'Phase 1', displayName: '2025/2026 Phase 1',
  status: 'active',
}
const club: Club = {
  id: 'club-1', affiliationNumber: '06680011', displayName: 'PPA Rixheim',
  isArchived: false, addresses: [], channels: [],
}
const division: Division = {
  id: 'div-1', phaseId: phase.id, displayName: 'D1', rank: 1, playersPerGame: 4, isArchived: false,
}

const groupOne: Group = { id: 'group-1', divisionId: 'div-1', number: 1, teamIds: ['team-a', 'team-b'], isArchived: false }
const groupTwo: Group = { id: 'group-2', divisionId: 'div-1', number: 2, teamIds: ['team-c', 'team-d'], isArchived: false }

function player(id: string): Player {
  return {
    id, firstName: `First-${id}`, lastName: `Last-${id}`, licenseNumber: `L-${id}`,
    email: `${id}@example.com`, phone: '', status: 'active', clubId: 'club-1',
  }
}

function team(id: string, number: number, groupId: string): Team {
  return {
    id, clubId: 'club-1', phaseId: phase.id, number, divisionId: 'div-1', groupId,
    gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00', captainId: 'p1',
    playerIds: ['p1'], isArchived: false,
  }
}

const initialData: DataState = {
  divisions: [division],
  competitions: [], competitionEligibilities: [],
  clubs: [club],
  seasons: [season],
  phases: [phase],
  groups: [groupOne, groupTwo],
  teams: [team('team-a', 1, 'group-1'), team('team-b', 2, 'group-1'), team('team-c', 3, 'group-2'), team('team-d', 4, 'group-2')],
  playerPhasePoints: [],
  players: [player('p1')],
  matchDays: [
    { id: 'md-1', groupId: 'group-1', number: 1, date: '2025-09-13' },
    { id: 'md-2', groupId: 'group-1', number: 2, date: '2025-09-20' },
    { id: 'md-3', groupId: 'group-2', number: 1, date: '2025-09-13' },
  ],
  games: [
    { id: 'game-1', matchDayId: 'md-1', homeTeamId: 'team-a', awayTeamId: 'team-b' },
    { id: 'game-2', matchDayId: 'md-2', homeTeamId: 'team-b', awayTeamId: 'team-a' },
    { id: 'game-3', matchDayId: 'md-3', homeTeamId: 'team-c', awayTeamId: 'team-d' },
  ],
  gameAvailabilities: [
    { gameId: 'game-1', playerId: 'p1', status: 'available' },
    { gameId: 'game-3', playerId: 'p1', status: 'available' },
  ],
  gameSelections: [
    { gameId: 'game-1', teamId: 'team-a', playerIds: ['p1'] },
    { gameId: 'game-3', teamId: 'team-c', playerIds: ['p1'] },
  ],
  users: [],
}

function Consumer({ groupId }: { groupId: string }) {
  const { groups, teams, matchDays, games, gameAvailabilities, gameSelections, resetGroupGames } = useAppData()
  return (
    <div>
      <button type="button" onClick={() => resetGroupGames(groupId)}>reset</button>
      <span data-testid="groups">{groups.map((g) => g.id).join(',')}</span>
      <span data-testid="teams">{teams.map((t) => t.id).join(',')}</span>
      <span data-testid="matchDays">{matchDays.map((m) => m.id).join(',')}</span>
      <span data-testid="games">{games.map((g) => g.id).join(',')}</span>
      <span data-testid="availabilities">{gameAvailabilities.map((a) => a.gameId).join(',')}</span>
      <span data-testid="selections">{gameSelections.map((s) => s.gameId).join(',')}</span>
    </div>
  )
}

function setup(groupId: string) {
  render(
    <DataProvider initialData={initialData}>
      <Consumer groupId={groupId} />
    </DataProvider>
  )
}

const at = (id: string) => screen.getByTestId(id).textContent

describe('resetGroupGames (#270)', () => {
  it('clears the journées, games, availabilities and selections of the target group', async () => {
    setup('group-1')

    expect(at('matchDays')).toBe('md-1,md-2,md-3')
    await userEvent.click(screen.getByRole('button', { name: 'reset' }))

    expect(at('matchDays')).toBe('md-3')
    expect(at('games')).toBe('game-3')
    expect(at('availabilities')).toBe('game-3')
    expect(at('selections')).toBe('game-3')
  })

  it('leaves the teams and the group itself in place', async () => {
    setup('group-1')

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))

    // The whole point of the action: a clean calendar to re-import into, not a
    // deleted pool. Both groups and all four teams survive.
    expect(at('groups')).toBe('group-1,group-2')
    expect(at('teams')).toBe('team-a,team-b,team-c,team-d')
  })

  it('does not touch another group', async () => {
    setup('group-2')

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))

    expect(at('matchDays')).toBe('md-1,md-2')
    expect(at('games')).toBe('game-1,game-2')
    expect(at('availabilities')).toBe('game-1')
    expect(at('selections')).toBe('game-1')
  })

  it('is a no-op for a group that has no journées', async () => {
    const empty: Group = { id: 'group-3', divisionId: 'div-1', number: 3, teamIds: [], isArchived: false }
    render(
      <DataProvider initialData={{ ...initialData, groups: [...initialData.groups, empty] }}>
        <Consumer groupId="group-3" />
      </DataProvider>
    )

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))

    expect(at('matchDays')).toBe('md-1,md-2,md-3')
    expect(at('games')).toBe('game-1,game-2,game-3')
  })
})
