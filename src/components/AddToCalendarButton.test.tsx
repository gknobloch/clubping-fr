import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockDivisions, mockClubs, mockSeasons, mockPhases, mockGroups, mockTeams,
  mockPlayers, mockPlayerPhasePoints, mockMatchDays, mockGames, mockGameAvailabilities,
  mockGameSelections, mockUsers,
} from '@/mock/data'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null }),
}))

const { AddToCalendarButton } = await import('./AddToCalendarButton')

const testData = {
  divisions: mockDivisions, clubs: mockClubs, seasons: mockSeasons, phases: mockPhases,
  groups: mockGroups, teams: mockTeams, players: mockPlayers,
  playerPhasePoints: mockPlayerPhasePoints, matchDays: mockMatchDays,
  games: mockGames, gameAvailabilities: mockGameAvailabilities,
  gameSelections: mockGameSelections, users: mockUsers,
}

// g1-8: team-1 receives opp-etival-1, with a time of its own (9h30).
const HOME_GAME_ID = 'g1-8'
// g1-1: team-1 away at opp-etival-1, an import-created club with no playing day.
const AWAY_GAME_ID = 'g1-1'

/** The .ics the click handed to the browser, as text. */
function renderAndClick(gameId: string, teams = mockTeams) {
  const game = mockGames.find((g) => g.id === gameId)!
  const matchDay = mockMatchDays.find((md) => md.id === game.matchDayId)!
  const team = teams.find((t) => t.id === 'team-1')!

  const blobs: Blob[] = []
  const click = vi.fn()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((b: Blob) => {
      blobs.push(b)
      return 'blob:ics'
    }),
    revokeObjectURL: vi.fn(),
  })
  // jsdom/happy-dom do not download; the anchor's click is what we watch.
  const createElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = createElement(tag)
    if (tag === 'a') el.click = click
    return el
  })

  render(
    <DataProvider initialData={{ ...testData, teams }}>
      <AddToCalendarButton game={game} matchDay={matchDay} team={team} />
    </DataProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter à mon agenda' }))

  const anchor = click.mock.instances[0] as HTMLAnchorElement | undefined
  return {
    clicked: click.mock.calls.length,
    fileName: (vi.mocked(document.createElement).mock.results
      .map((r) => r.value as HTMLElement)
      .find((el) => el instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined)?.download,
    anchor,
    text: () => blobs[0]?.text() ?? Promise.resolve(''),
  }
}

describe('AddToCalendarButton (#426)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("hands the browser an .ics on the match's own slot", async () => {
    const { clicked, fileName, text } = renderAndClick(HOME_GAME_ID)
    const ics = await text()

    expect(clicked).toBe(1)
    expect(fileName).toBe('club-ping-j8-etival-1.ics')
    expect(ics).toContain('SUMMARY:PPA Rixheim 1 – Etival 1')
    // 9h30 + the 3h30 of a 4-contre-4.
    expect(ics).toContain('DTSTART:')
    expect(ics).toContain('T093000')
    expect(ics).toContain('T130000')
    // The venue's full address, which is what the calendar hands to a maps app.
    expect(ics).toMatch(/LOCATION:.*Rixheim/)
    expect(ics).toContain('DESCRIPTION:Journée 8')
  })

  it('offers nothing at all while the date itself is unconfirmed', () => {
    // Away at a club the import created: the date is the FFTT's guess, so the
    // screens mark it and none of them proposes an agenda entry (#429).
    const game = mockGames.find((g) => g.id === AWAY_GAME_ID)!
    const matchDay = mockMatchDays.find((md) => md.id === game.matchDayId)!
    const team = mockTeams.find((t) => t.id === 'team-1')!

    render(
      <DataProvider initialData={testData}>
        <AddToCalendarButton game={game} matchDay={matchDay} team={team} />
      </DataProvider>,
    )

    expect(screen.queryByRole('button', { name: 'Ajouter à mon agenda' })).not.toBeInTheDocument()
  })

  it('books the whole day when the club plays a known day at no fixed hour', async () => {
    // The date is real — the club has a playing day — but nobody set an hour.
    const teams = mockTeams.map((t) => (t.id === 'team-1' ? { ...t, defaultTime: '' } : t))
    const games = mockGames.map((g) => (g.id === HOME_GAME_ID ? { ...g, time: undefined } : g))
    const game = games.find((g) => g.id === HOME_GAME_ID)!
    const matchDay = mockMatchDays.find((md) => md.id === game.matchDayId)!
    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return 'blob:ics' }),
      revokeObjectURL: vi.fn(),
    })

    render(
      <DataProvider initialData={{ ...testData, teams, games }}>
        <AddToCalendarButton game={game} matchDay={matchDay} team={teams.find((t) => t.id === 'team-1')!} />
      </DataProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à mon agenda' }))
    const ics = await blobs[0].text()

    expect(ics).toContain('DTSTART;VALUE=DATE:')
    expect(ics).not.toMatch(/DTSTART:\d/)
  })

  it('does not trip the surrounding control it sits in', () => {
    const game = mockGames.find((g) => g.id === HOME_GAME_ID)!
    const matchDay = mockMatchDays.find((md) => md.id === game.matchDayId)!
    const team = mockTeams.find((t) => t.id === 'team-1')!
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:ics', revokeObjectURL: () => {} })
    const outerClick = vi.fn()

    render(
      <DataProvider initialData={testData}>
        {/* The Journées matrix cell is itself a button: for an admin it opens
            the slot editor, and the icon must not open it (#426). */}
        <div role="button" tabIndex={0} onClick={outerClick}>
          <AddToCalendarButton game={game} matchDay={matchDay} team={team} />
        </div>
      </DataProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à mon agenda' }))

    expect(outerClick).not.toHaveBeenCalled()
  })
})
