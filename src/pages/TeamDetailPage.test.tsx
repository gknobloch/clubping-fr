import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockClubs,
  mockDivisions,
  mockGameAvailabilities,
  mockGameSelections,
  mockGames,
  mockGroups,
  mockMatchDays,
  mockPhases,
  mockPlayerPhasePoints,
  mockPlayers,
  mockSeasons,
  mockTeams,
  mockUsers,
} from '@/mock/data'

// AuthContext is mocked because ClubLogo and Avatar both read the auth token;
// no page here needs a signed-in user.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null }),
}))

const { TeamDetailPage } = await import('./TeamDetailPage')

const TEAM_ID = 'team-1'
const CLUB_ID = 'club-fftt-06680011'

function baseTestData(clubs = mockClubs) {
  return {
    divisions: mockDivisions, clubs, seasons: mockSeasons, phases: mockPhases,
    groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
    games: mockGames, gameAvailabilities: mockGameAvailabilities,
    gameSelections: mockGameSelections, users: mockUsers,
    playerPhasePoints: mockPlayerPhasePoints,
  }
}

function renderTeam(clubs = mockClubs) {
  return render(
    <MemoryRouter initialEntries={[`/equipes/${TEAM_ID}`]}>
      <DataProvider initialData={baseTestData(clubs)}>
        <Routes>
          <Route path="/equipes/:id" element={<TeamDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('TeamDetailPage — club logo in the identity banner (#386)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the club logo when the club has one, at any width', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) }))
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-logo'), revokeObjectURL: vi.fn() })

    const clubsWithLogo = mockClubs.map((c) =>
      c.id === CLUB_ID ? { ...c, logoUpdatedAt: '2026-01-01T00:00:00Z' } : c,
    )
    const { container } = renderTeam(clubsWithLogo)

    // ClubLogo fetches the image as a blob and swaps in an <img> once resolved
    // — nothing hides it behind a breakpoint, so a plain render finds it.
    return waitFor(() => expect(container.querySelector('img[src="blob:mock-logo"]')).toBeInTheDocument())
  })

  it('leaves the identity banner unchanged when the club has no logo', () => {
    const { container } = renderTeam()

    expect(screen.getByRole('heading', { name: 'PPA Rixheim 1' })).toBeInTheDocument()
    // ClubLogo renders nothing for a club without a logo — no <img> anywhere,
    // and the layout around the title is untouched.
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
