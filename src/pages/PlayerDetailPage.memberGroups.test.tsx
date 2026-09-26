import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockClubs, mockDivisions, mockGameAvailabilities, mockGameSelections, mockGames, mockGroups,
  mockMatchDays, mockMemberGroups, mockPhases, mockPlayerPhasePoints, mockPlayers, mockSeasons,
  mockTeams, mockUsers, mockCompetitions, mockCompetitionEligibilities,
} from '@/mock/data'
import type { MemberGroup } from '@/types'

// #602 — a member's fiche says which of the club's groups they are in, and a
// club admin files them from there.

const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, token: null }),
}))

const { PlayerDetailPage } = await import('./PlayerDetailPage')

const CLUB = 'club-fftt-06680011'

function renderPlayer(id: string, memberGroups: MemberGroup[] = mockMemberGroups) {
  return render(
    <MemoryRouter initialEntries={[`/joueurs/${id}`]}>
      <DataProvider
        initialData={{
          divisions: mockDivisions, clubs: mockClubs, seasons: mockSeasons, phases: mockPhases,
          competitions: mockCompetitions, competitionEligibilities: mockCompetitionEligibilities,
          groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
          games: mockGames, gameAvailabilities: mockGameAvailabilities,
          gameSelections: mockGameSelections, users: mockUsers,
          playerSeasonLicences: [], playerSeasonCategories: [], memberGroups,
          playerPhasePoints: mockPlayerPhasePoints,
        }}
      >
        <Routes>
          <Route path="/joueurs/:id" element={<PlayerDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

const groupsSection = () => screen.getByRole('region', { name: 'Groupes' })

beforeEach(() => {
  auth.user = { id: 'p2-player-4', role: 'player', isPlayer: true, clubId: CLUB }
})

describe('PlayerDetailPage — groups (#602)', () => {
  it('lists the groups a member is in, each linking to the filtered list', () => {
    renderPlayer('p2-player-1')
    const links = within(groupsSection()).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Bureau', 'Entraîneurs'])
    expect(links[1]).toHaveAttribute('href', '/joueurs?groupes=mgroup-entraineurs')
  })

  it('says so when a member is in none', () => {
    renderPlayer('p2-player-3')
    expect(within(groupsSection()).getByText('Dans aucun groupe.')).toBeInTheDocument()
  })

  it('shows no section while the club has no group at all', () => {
    renderPlayer('p2-player-1', [])
    expect(screen.queryByRole('region', { name: 'Groupes' })).not.toBeInTheDocument()
  })

  it('gives a player no way to file anybody', () => {
    renderPlayer('p2-player-1')
    expect(within(groupsSection()).queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
  })

  it('lets a club admin file the member, and shows the result at once', async () => {
    auth.user = { id: 'user-2', role: 'club_admin', isPlayer: false, clubId: CLUB }
    const user = userEvent.setup()
    renderPlayer('p2-player-3')

    await user.click(within(groupsSection()).getByRole('button', { name: 'Modifier' }))
    const dialog = screen.getByRole('dialog', { name: 'Groupes' })
    await user.click(within(dialog).getByRole('button', { name: 'Entraîneurs', pressed: false }))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(within(groupsSection()).getAllByRole('link').map((l) => l.textContent)).toEqual(['Entraîneurs'])
  })
})
