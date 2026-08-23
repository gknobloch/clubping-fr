import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { PlayerPhasePoints } from '@/types'
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

const CLUB_ID = 'club-fftt-06680011'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-2', email: 'club.admin@example.com', role: 'club_admin', clubId: CLUB_ID },
    token: null,
  }),
}))

const { MatchDaysPage } = await import('./MatchDaysPage')

/** The phase the page opens on. */
const PHASE_ID = mockPhases.find((p) => p.status === 'active')?.id ?? mockPhases[0].id

/**
 * A club player in none of the phase's rosters — the population of the
 * "Autres joueurs du club" table.
 */
const OTHER_PLAYER = (() => {
  const inRoster = new Set(
    mockTeams
      .filter((t) => t.phaseId === PHASE_ID && t.clubId === CLUB_ID)
      .flatMap((t) => t.playerIds ?? []),
  )
  const p = mockPlayers.find(
    (pl) => pl.clubId === CLUB_ID && pl.status === 'active' && !inRoster.has(pl.id),
  )
  if (!p) throw new Error('mock data no longer has a club player outside every roster')
  return p
})()

function renderPage(playerPhasePoints: PlayerPhasePoints[]) {
  render(
    <MemoryRouter initialEntries={['/journees']}>
      <DataProvider
        initialData={{
          divisions: mockDivisions, clubs: mockClubs, seasons: mockSeasons, phases: mockPhases,
          groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
          games: mockGames, gameAvailabilities: mockGameAvailabilities,
          gameSelections: mockGameSelections, users: mockUsers,
          playerPhasePoints,
        }}
      >
        <MatchDaysPage />
      </DataProvider>
    </MemoryRouter>,
  )
  const section = document.getElementById('other-players')
  if (!section) throw new Error('the "Autres joueurs du club" section did not render')
  return section
}

const fullName = `${OTHER_PLAYER.firstName} ${OTHER_PLAYER.lastName}`

/** Text of the player's name cell — the name, plus the points when shown. */
function nameCellText(section: HTMLElement) {
  const name = within(section).getByText((_, node) =>
    node?.tagName === 'SPAN' && (node.textContent ?? '').startsWith(fullName),
  )
  return name.textContent
}

// #431 — points hang off (phase, player) since #384, so a player in no roster
// has them too. This table used to show the name alone.
describe('MatchDaysPage — "Autres joueurs du club" (#431)', () => {
  it('shows the phase points next to the name, as the team tables do', () => {
    // The mock club records no points for its unrostered players; a real FFTT
    // import does, so the row is added here rather than to the shared set.
    const section = renderPage([
      ...mockPlayerPhasePoints,
      { phaseId: PHASE_ID, playerId: OTHER_PLAYER.id, points: '1042' },
    ])

    // The points sit in a nested <span> with a CSS margin, so the row's text
    // carries no space before the parenthesis.
    expect(nameCellText(section)).toBe(`${fullName}(1042)`)
  })

  it('reads the points on the phase, not on any team', () => {
    // Same player, points recorded on another phase only: nothing to show.
    const section = renderPage([
      ...mockPlayerPhasePoints,
      { phaseId: `${PHASE_ID}-suivante`, playerId: OTHER_PLAYER.id, points: '1042' },
    ])

    expect(nameCellText(section)).toBe(fullName)
  })
})
