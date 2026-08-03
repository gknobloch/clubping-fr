import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Club, Division, Group, Phase, Team } from '@/types'
import { GroupsPage } from './GroupsPage'

const authState = vi.hoisted(() => ({ role: 'general_admin' as string }))
const data = vi.hoisted(() => ({ resetGroupGames: vi.fn() }))
// happy-dom ships no window.confirm, so there is nothing to spy on — stub it.
const confirmMock = vi.hoisted(() => vi.fn<(message?: string) => boolean>())

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({
    token: null,
    logout: vi.fn(),
    user: { id: 'u1', email: 'a@b.c', role: authState.role, isPlayer: false },
  }),
}))

const phase: Phase = {
  id: 'phase-26-1', seasonId: '26', name: 'Phase 1', displayName: '2025/2026 Phase 1', status: 'active',
}
const club: Club = {
  id: 'club-1', affiliationNumber: '06680011', displayName: 'PPA Rixheim',
  isArchived: false, addresses: [], channels: [],
}
const division: Division = {
  id: 'div-1', phaseId: phase.id, displayName: 'D1', rank: 1, playersPerGame: 4, isArchived: false,
}
const group: Group = {
  id: 'group-1', divisionId: 'div-1', number: 1, teamIds: ['team-a'], isArchived: false,
}
const team: Team = {
  id: 'team-a', clubId: 'club-1', phaseId: phase.id, number: 1, divisionId: 'div-1',
  groupId: 'group-1', gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00',
  captainId: 'p1', playerIds: [], isArchived: false,
}

// The page is driven straight off the context, so a stub of useAppData keeps
// this test on what the page itself owns — who sees the action and what the
// confirmation says. The cascade it triggers is covered by
// src/contexts/resetGroupGames.test.tsx.
vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    groups: [group], divisions: [division], phases: [phase], teams: [team], clubs: [club],
    updateGroup: vi.fn(), addGroup: vi.fn(), archiveGroup: vi.fn(), deleteGroup: vi.fn(),
    resetGroupGames: data.resetGroupGames,
    fetchOrganizations: vi.fn().mockResolvedValue(null),
    fetchDivisionsPreview: vi.fn().mockResolvedValue(null),
  }),
}))

/** Renders the page and picks the division — groups only list once one is selected. */
async function setup(role = 'general_admin') {
  authState.role = role
  render(<GroupsPage />)
  await userEvent.selectOptions(screen.getByLabelText('Division'), 'div-1')
}

const resetButton = () => screen.queryByRole('button', { name: 'Réinitialiser les matchs' })

describe('GroupsPage — réinitialiser les matchs (#270)', () => {
  beforeEach(() => {
    data.resetGroupGames.mockClear()
    confirmMock.mockReset()
    vi.stubGlobal('confirm', confirmMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers the action to an admin', async () => {
    await setup('general_admin')
    expect(resetButton()).toBeInTheDocument()
  })

  it('hides the action from a non-admin', async () => {
    await setup('player')
    expect(resetButton()).not.toBeInTheDocument()
  })

  it('warns that the action is irreversible but spares the teams', async () => {
    confirmMock.mockReturnValue(false)
    await setup()

    await userEvent.click(resetButton()!)

    expect(confirmMock).toHaveBeenCalledTimes(1)
    const message = confirmMock.mock.calls[0][0] as string
    expect(message).toContain('Réinitialiser les matchs')
    expect(message).toContain('irréversible')
    expect(message).toContain('équipes du groupe seront conservées')
  })

  it('does not reset when the confirmation is declined', async () => {
    confirmMock.mockReturnValue(false)
    await setup()

    await userEvent.click(resetButton()!)

    expect(data.resetGroupGames).not.toHaveBeenCalled()
  })

  it('resets the right group once confirmed', async () => {
    confirmMock.mockReturnValue(true)
    await setup()

    await userEvent.click(resetButton()!)

    expect(data.resetGroupGames).toHaveBeenCalledWith('group-1')
  })
})
