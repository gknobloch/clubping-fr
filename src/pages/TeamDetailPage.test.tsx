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

describe('TeamDetailPage — game times in the match list (#424)', () => {
  // The receiving club's time, never the viewing team's (#287).
  function renderWithGames(games: typeof mockGames) {
    return render(
      <MemoryRouter initialEntries={[`/equipes/${TEAM_ID}`]}>
        <DataProvider initialData={{ ...baseTestData(), games }}>
          <Routes>
            <Route path="/equipes/:id" element={<TeamDetailPage />} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )
  }

  it("shows the game's own time beside its date", () => {
    renderWithGames(mockGames)

    // g1-8: team-1 at home, with a time of its own (9h30).
    expect(screen.getByText('9h30')).toBeInTheDocument()
  })

  it("falls back to the home team's default time when the game has none", () => {
    // team-1 receives, plays Saturdays at 16h00, and this fixture carries no time.
    const games = mockGames.map((g) =>
      g.id === 'g1-1' ? { ...g, homeTeamId: 'team-1', awayTeamId: 'opp-etival-1' } : g,
    )
    renderWithGames(games)

    expect(screen.getByText('16h00')).toBeInTheDocument()
  })

  it('shows no time for an away game at an opponent whose playing day is unknown', () => {
    renderWithGames(mockGames)

    // g1-1..g1-7 are away at auto-created opponents (no default day/time), so
    // only the journée's nominal date is shown — no invented slot.
    expect(screen.queryByText('16h00')).not.toBeInTheDocument()
  })
})

describe('TeamDetailPage — unconfirmed dates (#429)', () => {
  function renderWithGames(games: typeof mockGames) {
    return render(
      <MemoryRouter initialEntries={[`/equipes/${TEAM_ID}`]}>
        <DataProvider initialData={{ ...baseTestData(), games }}>
          <Routes>
            <Route path="/equipes/:id" element={<TeamDetailPage />} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )
  }

  it("marks a date the receiving club's playing day has not confirmed", () => {
    // g1-1..g1-7 are away at clubs the import created: the FFTT's nominal
    // week-end date is a guess, and the Journées matrix has said so since #287
    // while this list printed it as fact.
    renderWithGames(mockGames)

    expect(screen.getAllByText('Date à confirmer,', { exact: false }).length).toBeGreaterThan(0)
  })

  it('leaves a confirmed date unmarked', () => {
    renderWithGames(mockGames)

    // One "Détails du match" button per fixture row.
    const rows = screen.getAllByRole('button', { name: 'Détails du match' })
    const marked = screen.getAllByText('Date à confirmer,', { exact: false })
    // Every fixture is marked but one: g1-8, team-1 at home with a date and a
    // time of its own. The rest are away at clubs the import created.
    expect(marked).toHaveLength(rows.length - 1)
  })
})
