import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { render } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LARGE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import type { Club, Division, Game, Group, MatchDay, Phase, Player, Season, Team, User } from '@shared/types'
import HomeScreen from '@/app/(tabs)/index'

// ---------------------------------------------------------------------------
// Accueil — the next-match carousel at width (#446)
//
// The carousel pages by its own width, and `onMomentumScrollEnd` divides the
// offset by the card's: if the two ever disagree, the dots point at a card
// other than the one on screen. They are the same number here by construction,
// and this is what holds them to it — the card was `width - 32`, which on a
// slab is a 992pt letterbox, and inside the capped content column was wrong
// twice over.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null; displayName: string } = { user: null, displayName: 'Bo Martin' }
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

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const opponentClub: Club = { ...club, id: 'c2', affiliationNumber: '06680456', displayName: 'Mulhouse TT' }

const player: Player = {
  id: 'p1', firstName: 'Bo', lastName: 'Martin', licenseNumber: '681001',
  phone: '0600000000', status: 'active', clubId: 'c1',
}

const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 4, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Jeudi', defaultTime: '19h30', captainId: 'p1',
  isArchived: false, playerIds: ['p1'],
}
const opponent: Team = { ...team, id: 't2', clubId: 'c2', number: 6, playerIds: [] }

/** A fixture in a fortnight — the card only shows games from this week on. */
function inTwoWeeks(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  mockAuth.user = { ...player, role: 'player', isPlayer: true } as User
  mockData.clubs = [club, opponentClub]
  mockData.seasons = [{ id: 's1', displayName: '2025/2026', status: 'active' }]
  mockData.phases = [{ id: 'ph1', seasonId: 's1', name: 'phase1', displayName: 'Phase 1', status: 'active' }]
  mockData.teams = [team, opponent]
  mockData.players = [player]
  mockData.matchDays = [{ id: 'md1', groupId: 'grp1', number: 1, date: inTwoWeeks() }]
  mockData.games = [{ id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2', time: '19h30' }]
  mockData.groups = [{ id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', 't2'], isArchived: false }]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false },
  ]
})

afterEach(resetWindowSize)

const carouselWidth = () =>
  StyleSheet.flatten(screen.getByTestId('next-match-carousel').props.style).width
const pageWidth = () => StyleSheet.flatten(screen.getByTestId('next-match-page').props.style).width

it('fills the width of a phone, less the padding around it', () => {
  setWindowSize(PHONE_WIDTH)

  render(<HomeScreen />)

  expect(carouselWidth()).toBe(PHONE_WIDTH.width - 32)
})

it('stops at a card rather than stretching across a slab', () => {
  setWindowSize(TABLET_LARGE)

  render(<HomeScreen />)

  expect(carouselWidth()).toBe(480)
})

it('pages by exactly the width of a card, at either size', () => {
  setWindowSize(TABLET_LARGE)
  render(<HomeScreen />)
  expect(pageWidth()).toBe(carouselWidth())

  screen.unmount()
  setWindowSize(PHONE_WIDTH)
  render(<HomeScreen />)
  expect(pageWidth()).toBe(carouselWidth())
})
