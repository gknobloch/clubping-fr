import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockDivisions, mockClubs, mockSeasons, mockPhases, mockGroups, mockTeams,
  mockPlayers, mockMatchDays, mockGames, mockGameAvailabilities, mockGameSelections,
  mockUsers,
} from '@/mock/data'

// AuthContext is mocked rather than driven through the dev-login picker: the
// component and the useMatchDayEditing hook behind it both read `useAuth`, so
// one mock decides who is looking.
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

const compoLink = () => screen.queryByRole('link', { name: /Composer l’équipe/i })

describe('GameQuickView — reaching the line-up (#347)', () => {
  it('offers the captain a way through to the line-up page', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    // The quick view stays read-only; the page it links to owns the editing.
    // `equipe` matters: MatchDayDetailPage resolves the team from the query
    // string and renders "Match introuvable." if it is missing.
    expect(compoLink()).toHaveAttribute('href', `/journees/${GAME_ID}?equipe=${TEAM_ID}`)
  })

  it('offers it to the club admin too', () => {
    renderAs({ id: 'user-2', role: 'club_admin', isPlayer: false, clubId: 'club-fftt-06680011' })

    expect(compoLink()).toBeInTheDocument()
  })

  it('does not offer it to a player who is not the captain', () => {
    renderAs({ id: 'p2-player-3', role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    expect(compoLink()).not.toBeInTheDocument()
  })

  it('does not offer it to the general admin, who has no line-up say', () => {
    // Matches canEditGameSelection: a global admin administers, they do not
    // pick who plays.
    renderAs({ id: 'user-1', role: 'general_admin', isPlayer: false })

    expect(compoLink()).not.toBeInTheDocument()
  })

  it('does not offer it to a club admin from another club', () => {
    renderAs({ id: 'other', role: 'club_admin', isPlayer: false, clubId: 'club-other' })

    expect(compoLink()).not.toBeInTheDocument()
  })

  it('still shows the match itself to everyone', () => {
    renderAs({ id: 'p2-player-3', role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    expect(screen.getByText(/Disponibilités/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fermer/i })).toBeInTheDocument()
  })
})
