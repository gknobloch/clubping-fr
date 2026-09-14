import { screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Division, Game, Group, MatchDay, Phase, Player, Season, Team, User } from '@shared/types'
import HomeScreen from '@/app/(tabs)/index'

// ---------------------------------------------------------------------------
// Accueil, generic view — "Prochaines journées" (#522)
//
// This is the card a member who is not playing gets, typically a club admin.
// It used to list `matchDays` raw, and `GET /api/data` carries every club's: the
// review account, whose demo club plays one match a journée, was shown three
// "Journée 1" rows at three different dates — four other clubs' calendars. It
// went out on the first store-screenshot run (#520) before anyone read it.
//
// The rule is the web's, from the web's code (#474): the viewer's own club,
// merged across the poules its teams play in, and the whole table only for a
// general admin who oversees it.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null; displayName: string } = { user: null, displayName: 'Julien Mercier' }
const mockData = {
  clubs: [] as Club[],
  seasons: [] as Season[],
  teams: [] as Team[],
  players: [] as Player[],
  matchDays: [] as MatchDay[],
  games: [] as Game[],
  phases: [] as Phase[],
  divisions: [] as Division[],
  groups: [] as Group[],
  gameAvailabilities: [],
  gameSelections: [],
  setAvailability: jest.fn(),
  clearAvailability: jest.fn(),
  setGameSelection: jest.fn(),
  refreshing: false,
  refresh: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const club = (id: string, displayName: string): Club => ({
  id, affiliationNumber: `0668${id}`, displayName, isArchived: false, addresses: [], channels: [],
})

const team = (id: string, clubId: string, groupId: string): Team => ({
  id, clubId, phaseId: 'ph1', number: 1, divisionId: 'd1', groupId,
  gameLocationId: 'a1', defaultDay: 'Samedi', defaultTime: '17h00', captainId: '',
  isArchived: false, playerIds: [],
})

/** `n` days out, so the card always has a future round to show. */
function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Two poules of one phase — the shape a club with two teams actually has. */
beforeEach(() => {
  mockAuth.user = { id: 'u1', role: 'club_admin', isPlayer: false, clubId: 'c-mine' } as User
  mockData.clubs = [club('c-mine', 'Rixheim PPA'), club('c-other', 'Thann TT')]
  mockData.seasons = [{ id: 's1', displayName: '2025/2026', status: 'active' }]
  mockData.phases = [{ id: 'ph1', seasonId: 's1', name: 'phase1', displayName: 'Phase 1', status: 'active' }]
  mockData.players = []
  mockData.teams = [
    team('t1', 'c-mine', 'grp-a'),
    team('t2', 'c-mine', 'grp-b'),
    team('t-other', 'c-other', 'grp-a'),
    team('t-third', 'c-other', 'grp-b'),
  ]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false },
  ]
  mockData.groups = [
    { id: 'grp-a', divisionId: 'd1', number: 1, teamIds: ['t1', 't-other'], isArchived: false },
    { id: 'grp-b', divisionId: 'd1', number: 2, teamIds: ['t2', 't-third'], isArchived: false },
  ]
  // One journée, one row per poule — both called "Journée 1".
  mockData.matchDays = [
    { id: 'md-a', groupId: 'grp-a', number: 1, date: inDays(6) },
    { id: 'md-b', groupId: 'grp-b', number: 1, date: inDays(7) },
  ]
  mockData.games = [
    { id: 'g1', matchDayId: 'md-a', homeTeamId: 't1', awayTeamId: 't-other' },
    { id: 'g2', matchDayId: 'md-b', homeTeamId: 't-third', awayTeamId: 't2' },
  ]
})

const rounds = () => screen.queryAllByText(/^Journée \d+$/).map((n) => n.props.children.join(''))
/** The card itself — heading included, since that is what a club admin reads. */
const card = () => screen.queryByText('Prochaines journées')
const counts = () => screen.queryAllByText(/^\d+ matchs?$/).map((n) => n.props.children.join(''))

it('lists a journée once, however many poules the club plays it in', () => {
  render(<HomeScreen />)

  expect(rounds()).toEqual(['Journée 1'])
})

it('counts the club’s own matches in it, not the whole poule’s', () => {
  // The poules hold a match each for the other club too; neither is ours.
  mockData.games = [
    ...mockData.games,
    { id: 'g3', matchDayId: 'md-a', homeTeamId: 't-other', awayTeamId: 't-third' },
  ]

  render(<HomeScreen />)

  // One line, saying 2 — not one line per poule, each saying what that poule
  // holds.
  expect(counts()).toEqual(['2 matchs'])
})

// The reported bug: another club's calendar on a club admin's accueil.
it('shows nothing of a journée the club does not play in', () => {
  mockData.games = [{ id: 'g3', matchDayId: 'md-a', homeTeamId: 't-other', awayTeamId: 't-third' }]

  render(<HomeScreen />)

  expect(card()).toBeNull()
})

// Where a fresh onboarding leaves a club admin: a club, and nothing in it.
it('shows a club with no team nothing at all', () => {
  mockAuth.user = { id: 'u1', role: 'club_admin', isPlayer: false, clubId: 'c-empty' } as User

  render(<HomeScreen />)

  expect(card()).toBeNull()
})

it('leaves the general admin’s list whole — they oversee every club', () => {
  mockAuth.user = { id: 'u1', role: 'general_admin', isPlayer: false } as User
  mockData.games = [
    ...mockData.games,
    { id: 'g3', matchDayId: 'md-a', homeTeamId: 't-other', awayTeamId: 't-third' },
  ]

  render(<HomeScreen />)

  expect(rounds()).toEqual(['Journée 1'])
  expect(counts()).toEqual(['3 matchs'])
})

// A round is rarely one day: each poule gets its own slot inside the week, so
// naming a single date would name one poule's and drop the other's.
it('spans the dates its poules play on', () => {
  render(<HomeScreen />)

  expect(screen.getByText(/^du .+ au .+$/)).toBeTruthy()
})
