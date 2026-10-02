import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { render, PHONE_LANDSCAPE } from '@/__tests__/support/render'
import { PHONE_WIDTH, resetWindowSize, setWindowSize } from '@/__tests__/support/window'
import type {
  Club, Division, Game, GameAvailability, Group, MatchDay, Phase, Player, Team, User,
} from '@shared/types'
import PhaseAvailabilityScreen from '@/app/(tabs)/(detail)/team/disponibilites'

// ---------------------------------------------------------------------------
// Disponibilités de la phase (#623)
//
// A captain's request: the whole phase on one screen, Oui / PE / Non per
// journée and «5/7» per player. Seven journées do not fit a phone standing up,
// so the screen says to turn it — and once turned, they do.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ teamId: 't1' }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))

const mockAuth: { user: User | null } = { user: null }
const mockData = {
  clubs: [] as Club[],
  teams: [] as Team[],
  players: [] as Player[],
  matchDays: [] as MatchDay[],
  games: [] as Game[],
  phases: [] as Phase[],
  divisions: [] as Division[],
  groups: [] as Group[],
  gameAvailabilities: [] as GameAvailability[],
  gameSelections: [] as { teamId: string; gameId: string; playerIds: string[] }[],
  playerPhasePoints: [] as never[],
  seasons: [] as never[],
  playerSeasonLicences: [] as never[],
  playerSeasonCategories: [] as never[],
  competitions: [] as never[],
  competitionGroups: [] as never[],
}
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const mougey: Player = {
  id: 'p1', firstName: 'Mathieu', lastName: 'Mougey', licenseNumber: '1',
  phone: '', status: 'active', clubId: 'c1',
}
const heurtin: Player = { ...mougey, id: 'p2', firstName: 'Christophe', lastName: 'Heurtin' }
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 4, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Jeudi', defaultTime: '19h30', captainId: 'p1',
  isArchived: false, playerIds: ['p1', 'p2'],
}
const opponent: Team = { ...team, id: 'opp', clubId: 'c2', number: 1, playerIds: [] }
const JOURNEES = [1, 2, 3, 4, 5, 6, 7]

beforeEach(() => {
  mockPush.mockClear()
  mockAuth.user = { ...mougey, role: 'player', isPlayer: true } as User
  mockData.clubs = [club]
  mockData.teams = [team, opponent]
  mockData.players = [mougey, heurtin]
  mockData.phases = [{ id: 'ph1', seasonId: 's1', name: 'p1', displayName: '2026/2027 Phase 1', status: 'active' }]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false },
  ]
  mockData.groups = [{ id: 'grp1', divisionId: 'd1', number: 22, teamIds: ['t1', 'opp'], isArchived: false }]
  mockData.matchDays = JOURNEES.map((n) => ({
    id: `md${n}`, groupId: 'grp1', number: n, date: `2026-10-${String(n * 2).padStart(2, '0')}`,
  }))
  mockData.games = JOURNEES.map((n) => ({
    id: `g${n}`, matchDayId: `md${n}`, homeTeamId: 't1', awayTeamId: 'opp', time: '19h30',
  }))
  // Mougey: Oui, Oui, PE, Oui, Oui, PE, Oui — 5/7, the captain's own example.
  const answers = ['available', 'available', 'maybe', 'available', 'available', 'maybe', 'available'] as const
  mockData.gameAvailabilities = answers.map((status, i) => ({ gameId: `g${i + 1}`, playerId: 'p1', status }))
  mockData.gameSelections = [{ teamId: 't1', gameId: 'g1', playerIds: ['p1'] }]
})

afterEach(resetWindowSize)

it('donne le ratio de chaque joueur sur toute la phase', () => {
  setWindowSize(PHONE_WIDTH)
  render(<PhaseAvailabilityScreen />)

  expect(screen.getByTestId('phase-row-p1').props.accessibilityLabel).toBe(
    'Mathieu Mougey, disponible 5 sur 7, sélectionné 1 sur 7',
  )
  // Heurtin n'a rien répondu : sans réponse n'est pas un oui.
  expect(screen.getByTestId('phase-row-p2').props.accessibilityLabel).toBe(
    'Christophe Heurtin, disponible 0 sur 7, sélectionné 0 sur 7',
  )
  expect(screen.getByText('J7')).toBeTruthy()
  expect(screen.getByTestId('phase-cell-p1-g3').props.accessibilityLabel).toBe('Peut-être')
  expect(screen.getByTestId('phase-cell-p1-g1').props.accessibilityLabel).toBe('Oui, dans la composition')
  expect(screen.getByTestId('phase-cell-p2-g1').props.accessibilityLabel).toBe('Sans réponse')
})

it('abrège le prénom sur un téléphone', () => {
  setWindowSize(PHONE_WIDTH)
  render(<PhaseAvailabilityScreen />)

  expect(screen.getByText('M. Mougey')).toBeTruthy()
})

it('invite à tourner un téléphone debout, et plus une fois couché', () => {
  setWindowSize(PHONE_WIDTH)
  const { unmount } = render(<PhaseAvailabilityScreen />)
  expect(screen.getByTestId('phase-rotate-hint')).toBeTruthy()
  unmount()

  setWindowSize({ width: 844, height: 390 })
  render(<PhaseAvailabilityScreen />, { metrics: PHONE_LANDSCAPE })
  expect(screen.queryByTestId('phase-rotate-hint')).toBeNull()
})

it('ouvre le match d’une journée, sur l’axe de l’équipe', () => {
  setWindowSize(PHONE_WIDTH)
  render(<PhaseAvailabilityScreen />)

  fireEvent.press(screen.getByTestId('phase-col-g4'))

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/match/[id]',
    params: { id: 'g4', teamId: 't1', from: 'team' },
  })
})

it('compte, par journée, les disponibles et la composition', () => {
  setWindowSize(PHONE_WIDTH)
  render(<PhaseAvailabilityScreen />)

  expect(screen.getByText('Disponibles')).toBeTruthy()
  expect(screen.getByText('Sélectionnés')).toBeTruthy()
  // J1 : Mougey seul a dit oui, et seul est aligné sur une division à quatre.
  expect(screen.getByTestId('phase-available-g1').props.children).toBe(1)
  expect(screen.getByTestId('phase-selected-g1').props.children).toEqual([1, '/', 4])
  expect(screen.getByTestId('phase-selected-g2').props.children).toEqual([0, '/', 4])
})

it('serre les lignes sur un téléphone couché, pour six joueurs et les deux totaux', () => {
  setWindowSize({ width: 844, height: 390 })
  render(<PhaseAvailabilityScreen />, { metrics: PHONE_LANDSCAPE })
  const couche = StyleSheet.flatten(screen.getByTestId('phase-row-p1').props.style).height

  setWindowSize(PHONE_WIDTH)
  screen.unmount()
  render(<PhaseAvailabilityScreen />)
  const debout = StyleSheet.flatten(screen.getByTestId('phase-row-p1').props.style).height

  expect(couche).toBe(32)
  expect(debout).toBe(48)
})
