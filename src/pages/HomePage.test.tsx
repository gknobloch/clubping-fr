import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
  mockCompetitions,
  mockCompetitionEligibilities,
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
  competitions: mockCompetitions, competitionEligibilities: mockCompetitionEligibilities,
  groups: mockGroups, teams: mockTeams, players: mockPlayers, matchDays: mockMatchDays,
  games: mockGames, gameAvailabilities: mockGameAvailabilities,
  gameSelections: mockGameSelections, users: mockUsers,
  playerPhasePoints: mockPlayerPhasePoints,
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

  // #456 — the sheet is the phone's answer. On a wide screen it was a
  // full-height list of the club laid over the Journées matrix, which already
  // does the job with the availabilities and the brûlage in view. Both
  // elements are in the DOM at once here: which one is live is a media query,
  // and jsdom applies none — so they are told apart by role, as the two
  // "Détails" links in GameQuickView.test.tsx are.
  it('sends the captain to the deep-linked journée instead, from md up', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    const link = screen.getByRole('link', { name: /Composer l'équipe/ })
    expect(link).toHaveAttribute('href', '/journees?equipe=team-1&match=g1-8')
    // The ring and the fill state travel together: the count is the reason to
    // click either one.
    expect(link).toHaveTextContent('4/4')
  })

  it('keeps the two destinations behind the same gate', () => {
    renderAs({ id: ROSTER_MEMBER_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    expect(screen.queryByRole('link', { name: /Composer l'équipe/ })).not.toBeInTheDocument()
  })

  it('shows "Matchs joués" alongside "À confirmer" at every width', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    const playedLabel = screen.getByText('Matchs joués')
    // Label and figure are the two ends of one line now — a footer under the
    // card rather than a column beside it (#461).
    expect(playedLabel.nextElementSibling).toHaveTextContent('2/7')
    expect(screen.getByText('À confirmer')).toBeInTheDocument()

    // What matters is that neither tile is hidden at a breakpoint: they are
    // content, not a mobile affordance (#385). How the pair is *arranged* is
    // free to change, so this asserts visibility, not the grid's classes.
    for (const el of [playedLabel, screen.getByText('À confirmer')]) {
      expect(el.closest('.hidden')).toBeNull()
      expect(el.className).not.toMatch(/\bhidden\b/)
    }
  })
})

describe('HomePage — the time on the next-match card (#427)', () => {
  function renderWithGames(games: typeof mockGames) {
    authState.user = { id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID }
    return render(
      <MemoryRouter>
        <DataProvider initialData={{ ...testData, games }}>
          <HomePage />
        </DataProvider>
      </MemoryRouter>,
    )
  }

  it("uses the receiving club's default time when the fixture has none", () => {
    // g1-8 is team-1 at home; team-1 plays Saturdays at 16h00. The card read
    // game.time raw and stayed silent here, while the team's match list said
    // 16h00 — two screens, one match, two answers.
    const games = mockGames.map((g) => (g.id === 'g1-8' ? { ...g, time: undefined } : g))
    renderWithGames(games)

    expect(screen.getByText(/· 16h00/)).toBeInTheDocument()
  })

  it('says nothing when the receiving club has no known playing day', () => {
    // Away at an opponent the import created: no default day, so no hour —
    // the viewing team's own would be about a hall it is not playing in.
    const games = mockGames.map((g) =>
      g.id === 'g1-8'
        ? { ...g, time: undefined, homeTeamId: 'opp-etival-1', awayTeamId: 'team-1' }
        : g,
    )
    renderWithGames(games)

    expect(screen.queryByText(/· \d+h\d+/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// #461 — the card carries the team from md: up
//
// Both halves of every width-dependent pair are in the DOM at once: which one
// is live is a media query, and jsdom applies none. They are told apart by the
// class that decides, exactly as the two "Composer l'équipe" elements above are
// told apart by role.
// ---------------------------------------------------------------------------
describe('HomePage — the next-match card carries the team (#461)', () => {
  const roster = () => screen.getByRole('list', { name: /Disponibilité de l'équipe/ })

  it('names every team-mate and their answer, from md up', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    const list = roster()
    expect(list.className).toMatch(/\bhidden\b/)
    expect(list.className).toMatch(/md:block/)
    for (const name of ['Joris Szulc', 'Grégory Canaque', 'Quentin Colle', 'Stéphane Lach', 'Enzo Lotz']) {
      expect(within(list).getByText(name)).toBeInTheDocument()
    }
  })

  it('leaves the count and its "Aperçu" to the phone', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    // With the list on screen the button would open a modal repeating the
    // column beside it, so above the threshold it is not there at all.
    const apercu = screen.getByRole('button', { name: 'Aperçu' })
    expect(apercu.closest('.md\\:hidden')).not.toBeNull()
    expect(screen.getByText('2 disponibles · 1 sans réponse').closest('.md\\:hidden')).not.toBeNull()
  })

  it('lets a captain answer for a team-mate, from the row itself', () => {
    renderAs({ id: CAPTAIN_ID, role: 'player', isPlayer: true, clubId: CLUB_ID })

    // Grégory answered "peut-être"; his captain moves him to "oui" in one tap.
    const row = within(roster()).getByText('Grégory Canaque').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'OUI' }))

    expect(within(row).getByRole('button', { name: 'OUI' }).className).toContain('bg-green-50')
  })

  it('leaves everyone else reading', () => {
    // A roster member is not their team-mates' captain: they see the answers,
    // and the only row they can act on is their own.
    renderAs({ id: 'p2-player-4', role: 'player', isPlayer: true, clubId: CLUB_ID })

    const list = roster()
    const other = within(list).getByText('Grégory Canaque').closest('li')!
    expect(within(other).queryByRole('button', { name: 'OUI' })).not.toBeInTheDocument()

    const mine = within(list).getByText('Enzo Lotz').closest('li')!
    expect(within(mine).getByRole('button', { name: 'OUI' })).toBeInTheDocument()
  })
})
