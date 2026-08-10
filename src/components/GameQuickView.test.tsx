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

// Both breakpoints render a "Détails" link; CSS decides which one is a grid
// item. happy-dom evaluates no media queries, so both are in the DOM here and
// the classes are what distinguish them.
const detailLinks = () => screen.queryAllByRole('link', { name: /^Détails$/i })
const mobileLink = () => detailLinks().find((a) => a.className.includes('md:hidden'))
const desktopLink = () => detailLinks().find((a) => a.className.includes('md:block'))

describe('GameQuickView — reaching the round (#347)', () => {
  const asCaptain = { id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' }

  it('sends a phone to the single-match screen', () => {
    renderAs(asCaptain)

    // The matrix cannot fit 375px, so below md: the per-match screen (#337) is
    // the whole point of the destination.
    expect(mobileLink()).toHaveAttribute('href', `/journees/${GAME_ID}?equipe=${TEAM_ID}`)
  })

  it('sends a wide screen to the deep-linked matrix', () => {
    renderAs(asCaptain)

    // `equipe` and `match` are what MatchDaysPage keys on: without them it
    // opens on the current week with nothing singled out.
    expect(desktopLink()).toHaveAttribute('href', `/journees?equipe=${TEAM_ID}&match=${GAME_ID}`)
  })

  it('shows exactly one destination per breakpoint', () => {
    renderAs(asCaptain)

    expect(detailLinks()).toHaveLength(2)
    // A `hidden` element is not a grid item, so only one ever occupies the
    // second column.
    expect(mobileLink()?.className).toContain('md:hidden')
    expect(desktopLink()?.className).toContain('hidden')
  })

  it('offers it to a player who is not the captain', () => {
    renderAs({ id: 'p2-player-3', role: 'player', isPlayer: true, clubId: 'club-fftt-06680011' })

    expect(detailLinks()).toHaveLength(2)
  })

  it('offers it to the club admin and the general admin', () => {
    renderAs({ id: 'user-2', role: 'club_admin', isPlayer: false, clubId: 'club-fftt-06680011' })
    expect(detailLinks()).toHaveLength(2)

    renderAs({ id: 'user-1', role: 'general_admin', isPlayer: false })
    expect(detailLinks().length).toBeGreaterThan(0)
  })

  it('keeps the way out beside the way on', () => {
    renderAs(asCaptain)

    const row = screen.getAllByRole('button', { name: /Fermer/i })[0].parentElement
    expect(row?.className).toContain('grid-cols-2')
    expect(row).toContainElement(mobileLink()!)
    expect(row).toContainElement(desktopLink()!)
  })
})
