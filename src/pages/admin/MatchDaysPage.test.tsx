import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { Phase, PlayerPhasePoints } from '@/types'
import { getPhaseMatchDays, activeMatchDayNumber, formatMatchDayRange, gameDate } from '@/lib/matchdays'
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

/** The teams the page's journée switcher speaks for (#450). */
const clubTeamIds = () =>
  new Set(mockTeams.filter((t) => t.clubId === CLUB_ID && t.phaseId === PHASE_ID).map((t) => t.id))

const clubMatchDayGroups = () =>
  getPhaseMatchDays(PHASE_ID, mockMatchDays, mockGroups, mockDivisions, {
    games: mockGames,
    teamIds: clubTeamIds(),
  })

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

function baseData() {
  return {
    divisions: mockDivisions, clubs: mockClubs, seasons: mockSeasons, phases: mockPhases,
    groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
    games: mockGames, gameAvailabilities: mockGameAvailabilities,
    gameSelections: mockGameSelections, users: mockUsers,
    playerPhasePoints: mockPlayerPhasePoints,
  }
}

function renderPage(playerPhasePoints: PlayerPhasePoints[]) {
  render(
    <MemoryRouter initialEntries={['/journees']}>
      <DataProvider initialData={{ ...baseData(), playerPhasePoints }}>
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

// #432 — the switcher paged through `phases` in API order, so "phase
// précédente" was not reliably the previous phase.
describe('MatchDaysPage — sélecteur de phase (#432)', () => {
  const phase = (id: string, displayName: string, status: Phase['status']): Phase => ({
    ...mockPhases[0],
    id,
    name: displayName.slice(10),
    displayName,
    status,
  })

  const OLDEST = phase('phase-26-1', '2025/2026 Phase 1', 'active')
  const MIDDLE = phase('phase-26-2', '2025/2026 Phase 2', 'archived')
  const NEWEST = phase('phase-27-1', '2026/2027 Phase 1', 'archived')

  /** Deliberately not chronological — this is what the API can hand back. */
  const SHUFFLED = [OLDEST, NEWEST, MIDDLE]

  function renderWithPhases(phases: Phase[]) {
    render(
      <MemoryRouter initialEntries={['/journees']}>
        <DataProvider initialData={{ ...baseData(), phases }}>
          <MatchDaysPage />
        </DataProvider>
      </MemoryRouter>,
    )
  }

  /** The switcher is drawn twice — stacked below `md:`, a pill above — and
      happy-dom applies no media queries, so both are in the tree. */
  const switcherLabels = () =>
    screen.getAllByText(/^Saison /).map((el) => el.textContent)

  it('opens on the active phase', () => {
    renderWithPhases(SHUFFLED)
    expect(new Set(switcherLabels())).toEqual(new Set(['Saison 2025/2026 Phase 1']))
  })

  it('opens on the most recent phase when none is active', () => {
    renderWithPhases(SHUFFLED.map((p) => ({ ...p, status: 'archived' as const })))
    expect(new Set(switcherLabels())).toEqual(new Set(['Saison 2026/2027 Phase 1']))
  })

  it('pages to the chronological neighbour, not to the next one in the array', () => {
    renderWithPhases(SHUFFLED)

    // Next in the array is 2026/2027 Phase 1; next in time is 2025/2026 Phase 2.
    fireEvent.click(screen.getAllByLabelText('Phase suivante')[0])
    expect(new Set(switcherLabels())).toEqual(new Set(['Saison 2025/2026 Phase 2']))

    fireEvent.click(screen.getAllByLabelText('Phase suivante')[0])
    expect(new Set(switcherLabels())).toEqual(new Set(['Saison 2026/2027 Phase 1']))

    fireEvent.click(screen.getAllByLabelText('Phase précédente')[0])
    expect(new Set(switcherLabels())).toEqual(new Set(['Saison 2025/2026 Phase 2']))
  })

  it('stops at both ends of the ordered list', () => {
    renderWithPhases(SHUFFLED)
    // Oldest phase: nothing before it.
    for (const b of screen.getAllByLabelText('Phase précédente')) expect(b).toBeDisabled()

    fireEvent.click(screen.getAllByLabelText('Phase suivante')[0])
    fireEvent.click(screen.getAllByLabelText('Phase suivante')[0])
    for (const b of screen.getAllByLabelText('Phase suivante')) expect(b).toBeDisabled()
  })

  it('names the journée and the week it covers, instead of a bare "J8"', () => {
    renderWithPhases(mockPhases)

    const groups = clubMatchDayGroups()
    const current = groups.find((g) => g.number === activeMatchDayNumber(groups))
    expect(current, 'mock data needs at least one journée').toBeDefined()

    expect(screen.getByText(`Journée ${current!.number}`)).toBeInTheDocument()
    expect(
      screen.getByText(formatMatchDayRange(current!.startDate, current!.endDate)),
    ).toBeInTheDocument()
  })

  // #450 — the subtitle used to span every poule of the phase, so it could
  // name a week in which the club plays nothing at all.
  it('covers the dates of the club’s own matches, and no others', () => {
    renderWithPhases(mockPhases)

    const groups = clubMatchDayGroups()
    const current = groups.find((g) => g.number === activeMatchDayNumber(groups))!
    const roundIds = new Set(current.matchDays.map((m) => m.id))
    const clubDates = mockGames
      .filter((g) => roundIds.has(g.matchDayId))
      .filter((g) => clubTeamIds().has(g.homeTeamId) || clubTeamIds().has(g.awayTeamId))
      .map((g) => gameDate(g, mockMatchDays.find((m) => m.id === g.matchDayId)!))
      .sort()
    expect(clubDates.length, 'mock data needs a club match this journée').toBeGreaterThan(0)

    expect(
      screen.getByText(formatMatchDayRange(clubDates[0], clubDates[clubDates.length - 1])),
    ).toBeInTheDocument()
  })
})
