import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockDivisions, mockClubs, mockSeasons, mockPhases, mockGroups, mockTeams,
  mockPlayers, mockMatchDays, mockGames, mockGameAvailabilities, mockGameSelections,
  mockUsers,
} from '@/mock/data'

// AuthContext is mocked rather than driven through the dev-login picker, so
// one mock decides who is looking at the page (mirrors GameQuickView.test.tsx).
const authState = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user, displayName: 'Test User', roleLabel: 'Joueur', token: null }),
}))

const { HomePage } = await import('./HomePage')

const testData = {
  divisions: mockDivisions, clubs: mockClubs, seasons: mockSeasons, phases: mockPhases,
  groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
  games: mockGames, gameAvailabilities: mockGameAvailabilities,
  gameSelections: mockGameSelections, users: mockUsers,
}

// team-1's next match is g1-8, the fixtures' only future game with responses
// recorded: available (p2-player-5, p2-player-3), maybe (p2-player-1),
// unavailable (p2-player-2, the captain, overridden), no response
// (p2-player-4) — 2 available against the division's 4 playersPerGame, so the
// summary line is short and the line-up (g1-8's selection) is already 4/4.
const CAPTAIN_ID = 'p2-player-2'
const ROSTER_MEMBER_ID = 'p2-player-1'
const CLUB_ID = 'club-fftt-06680011'

function renderAs(user: Record<string, unknown> | null) {
  authState.user = user
  return render(
    <MemoryRouter>
      <DataProvider initialData={testData}>
        <HomePage />
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('HomePage — next-match card status and shortcuts (#385)', () => {
  it('says how many are available and how many have not answered, in alert style when short', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    const summary = screen.getByText('2 disponibles · 1 sans réponse')
    expect(summary.className).toContain('text-amber-600')
  })

  it('offers the captain a one-tap line-up shortcut showing the fill state', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    expect(screen.getByRole('button', { name: /Composer l'équipe/ })).toHaveTextContent('4/4')
  })

  it('hides the compose shortcut from a non-captain roster player', () => {
    renderAs({ id: ROSTER_MEMBER_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    // The response summary still appears — only the captain-only shortcut is gated.
    expect(screen.getByText('2 disponibles · 1 sans réponse')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Composer l'équipe/ })).not.toBeInTheDocument()
  })

  it('opens the existing selection sheet from the shortcut', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    fireEvent.click(screen.getByRole('button', { name: /Composer l'équipe/ }))

    expect(screen.getByRole('heading', { name: /Sélection — PPA Rixheim 1/ })).toBeInTheDocument()
  })

  it('shows "Matchs joués" next to "À confirmer", unconditionally on breakpoint', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    const playedLabel = screen.getByText('Matchs joués')
    const playedValue = playedLabel.parentElement!.nextElementSibling
    expect(playedValue).toHaveTextContent('2/7')
    expect(screen.getByText('À confirmer')).toBeInTheDocument()

    // The pair sits in a plain grid-cols-2, not a md:-gated one — both tiles
    // are meant to show at every width, not just on desktop (#385).
    const tilesRow = playedLabel.closest('.grid')
    expect(tilesRow?.className).not.toMatch(/\bmd:/)
  })
})
