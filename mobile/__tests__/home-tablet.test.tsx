import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { render } from '@/__tests__/support/render'
import { CONTENT_MAX_WIDTH } from '@/constants/layout'
import {
  PHONE_WIDTH,
  TABLET_LARGE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import type { Club, Division, Game, Group, MatchDay, Phase, Player, Season, Team, User } from '@shared/types'
import HomeScreen from '@/app/(tabs)/index'

// ---------------------------------------------------------------------------
// Accueil at tablet width (#446, #459)
//
// The match card runs the width of the content and splits inside itself: the
// game and my answer on the left, the team's answers on the right. Below the
// threshold it is the card the phone has always had, summary line and all.
//
// The carousel is as wide as that card, and `onMomentumScrollEnd` divides the
// scroll offset by the card's width to find the page: if the two ever disagree,
// the dots point at a card other than the one on screen. They are the same
// number by construction, and this is what holds them to it.
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
/** The screen's own padding, on either side of the content. */
const PADDING = 16

it('fills the width of a phone, less the padding around it', () => {
  setWindowSize(PHONE_WIDTH)

  render(<HomeScreen />)

  expect(carouselWidth()).toBe(PHONE_WIDTH.width - PADDING * 2)
})

it('gives the carousel the width of the content, not of the slab', () => {
  setWindowSize(TABLET_LARGE)

  render(<HomeScreen />)

  // Two reading widths, less the padding — not the 992pt the window would have
  // given, and not the 608 a single reading column would have.
  const content = Math.min(TABLET_LARGE.width, CONTENT_MAX_WIDTH * 2) - PADDING * 2
  expect(carouselWidth()).toBe(content)
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

it('splits the card on a tablet and stacks it on a phone', () => {
  setWindowSize(TABLET_LARGE)
  render(<HomeScreen />)
  expect(screen.getByTestId('match-card-split')).toBeTruthy()

  screen.unmount()
  setWindowSize(PHONE_WIDTH)
  render(<HomeScreen />)
  expect(screen.queryByTestId('match-card-split')).toBeNull()
})

it('stacks an iPad in Split View, which is handed a phone-width window', () => {
  // The card's own width decides, not the device: half a slab is 507pt, and
  // two halves of that are two cramped columns.
  setWindowSize({ width: 507, height: 1366 })

  render(<HomeScreen />)

  expect(screen.queryByTestId('match-card-split')).toBeNull()
})

it('takes the width the column reports, not the one the window implies', () => {
  // The derived formula and the real column had to agree, and stopped agreeing
  // as soon as either end moved — insets, a cap, a padding. The card asks.
  setWindowSize(TABLET_LARGE)
  render(<HomeScreen />)

  fireEvent(screen.getByTestId('match-column'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 512, height: 400 } },
  })

  expect(carouselWidth()).toBe(512)
  expect(pageWidth()).toBe(512)
  // And the split follows that measurement, not the 992pt window behind it.
  expect(screen.queryByTestId('match-card-split')).toBeNull()
})

it('keeps a phone on its side a phone', () => {
  // An iPhone 17 in landscape is 874×402: wider than the tablet threshold read
  // off the width alone, and 402pt tall. It used to be handed a two-column
  // content width and a card wider than the column that held it.
  setWindowSize({ width: 874, height: 402 })

  render(<HomeScreen />)

  expect(carouselWidth()).toBe(CONTENT_MAX_WIDTH - PADDING * 2)
  expect(screen.queryByTestId('match-card-split')).toBeNull()
})
