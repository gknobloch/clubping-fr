import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockDivisions, mockClubs, mockSeasons, mockPhases, mockGroups, mockTeams,
  mockPlayers, mockMatchDays, mockGames, mockGameAvailabilities, mockGameSelections,
  mockUsers,
} from '@/mock/data'

// AuthContext is mocked rather than driven through the dev-login picker, so one
// mock decides who is looking at the modal.
const authState = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
}))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: authState.user }),
}))

const { GameQuickView } = await import('./GameQuickView')

const testData = {
  divisions: mockDivisions, clubs: mockClubs, seasons: mockSeasons, phases: mockPhases,
  groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
  games: mockGames, gameAvailabilities: mockGameAvailabilities,
  gameSelections: mockGameSelections, users: mockUsers,
}

// team-1's captain in the fixtures is p2-player-2; g1-1 is one of its games.
const CAPTAIN_ID = 'p2-player-2'
const GAME_ID = 'g1-1'
const TEAM_ID = 'team-1'

function renderAs(user: Record<string, unknown> | null) {
  authState.user = user
  return render(
    <MemoryRouter>
      <DataProvider initialData={testData}>
        <GameQuickView gameId={GAME_ID} teamId={TEAM_ID} onClose={() => {}} />
      </DataProvider>
    </MemoryRouter>,
  )
}

const journeesLink = () => screen.queryByRole('link', { name: /Voir dans Journées/i })

describe('GameQuickView — reaching the round in context (#347)', () => {
  // `equipe` and `match` are what MatchDaysPage deep-links on: without them it
  // opens on the current week with nothing singled out.
  const expectedHref = `/journees?equipe=${TEAM_ID}&match=${GAME_ID}`

  it('points at the team and fixture on the Journées screen', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    expect(journeesLink()).toHaveAttribute('href', expectedHref)
  })

  it('offers it to a player who is not the captain', () => {
    // Seeing the round in context is reading; the Journées screen gates its own
    // editing controls.
    renderAs({ id: 'p2-player-3', role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    expect(journeesLink()).toHaveAttribute('href', expectedHref)
  })

  it('offers it to the club admin', () => {
    renderAs({ id: 'user-2', role: 'club_admin', isPlayer: false, clubId: 'club-fftt-06680011' })

    expect(journeesLink()).toBeInTheDocument()
  })

  it('offers it to the general admin', () => {
    renderAs({ id: 'user-1', role: 'general_admin', isPlayer: false })

    expect(journeesLink()).toBeInTheDocument()
  })

  it('does not send anyone to the single-game detail screen', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    // /journees/:gameId is the mobile drill-down from the Journées list (#337).
    // Coming from the home screen the round itself is the useful destination.
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links.some((href) => href?.startsWith(`/journees/${GAME_ID}`))).toBe(false)
  })

  it('keeps the way out beside the way on', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    const row = screen.getByRole('button', { name: /Fermer/i }).parentElement
    expect(row?.className).toContain('grid-cols-2')
    expect(row).toContainElement(journeesLink())
  })
})
