import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { resetParams, setParams, useParams } from '@/__tests__/support/routeParams'
import { PHONE_WIDTH, resetWindowSize, setWindowSize } from '@/__tests__/support/window'
import type { Club, Division, Federation, Group, Phase, Player, Season, Team, User } from '@shared/types'
import EquipesScreen from '@/app/(tabs)/equipes'

// ---------------------------------------------------------------------------
// La fédération d'abord, puis la phase (#645)
//
// Kembs joue à la FFTT et à l'AGR : deux saisons, deux phases actives, et un
// Kembs 1 dans chacune. Sans le choix de la fédération, l'écran ouvrait sur la
// première phase active venue. Épinglé : qui voit « FFTT | AGR », ce qu'il
// change, et qu'un club d'une seule fédération n'en voit rien.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null } = { user: null }
const mockData = {
  teams: [] as Team[],
  players: [] as Player[],
  clubs: [] as Club[],
  phases: [] as Phase[],
  seasons: [] as Season[],
  federations: [] as Federation[],
  divisions: [] as Division[],
  groups: [] as Group[],
  matchDays: [],
  games: [],
  gameSelections: [],
  playerSeasonLicences: [],
  playerSeasonCategories: [],
  competitions: [],
  competitionGroups: [],
  updateTeam: jest.fn(),
  refreshing: false,
  refresh: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
const mockSetParams = setParams
const mockUseParams = useParams
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), setParams: mockSetParams }),
  useLocalSearchParams: () => mockUseParams(),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))
jest.mock('@/components/ClubLogo', () => ({ ClubLogo: () => null }))

const club = (id: string, displayName: string, over: Partial<Club>): Club =>
  ({ id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over })
const kembs = club('kembs', 'Kembs TT', {
  affiliationNumber: '06680140', affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }],
})
const landser = club('landser', 'Landser ASL', { affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] })

const phase = (id: string, seasonId: string): Phase =>
  ({ id, seasonId, name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active' })
const team = (id: string, clubId: string, phaseId: string): Team => ({
  id, clubId, phaseId, number: 1, divisionId: '', groupId: '', gameLocationId: '',
  defaultDay: 'Vendredi', defaultTime: '20:00', captainId: '', isArchived: false, playerIds: [],
})

const as = (clubId: string) => {
  mockAuth.user = { id: 'u', role: 'club_admin', isPlayer: false, clubId } as User
}

beforeEach(() => {
  resetParams()
  setWindowSize(PHONE_WIDTH)
  mockData.federations = [
    { id: 'fftt', displayName: 'Fédération française de tennis de table', shortName: 'FFTT', isImported: true, sortOrder: 0 },
    { id: 'agr', displayName: 'AGR Tennis de Table', shortName: 'AGR', isImported: false, sortOrder: 1 },
  ]
  // One season; each federation's phase in it (#645).
  mockData.seasons = [{ id: '27', displayName: '2026/2027', status: 'active' }]
  mockData.phases = [phase('phase-27-1', '27'), { ...phase('phase-agr-27-1', '27'), federationId: 'agr' }]
  mockData.clubs = [kembs, landser]
  mockData.teams = [
    team('kembs-fftt', 'kembs', 'phase-27-1'),
    team('kembs-agr', 'kembs', 'phase-agr-27-1'),
    team('landser-agr', 'landser', 'phase-agr-27-1'),
  ]
})

afterEach(resetWindowSize)

describe('Équipes, club dans deux fédérations', () => {
  it('opens on the FFTT, and shows the AGR Kembs 1 once AGR is picked', () => {
    as('kembs')
    render(<EquipesScreen />)
    expect(screen.getByTestId('federation-switch')).toBeTruthy()
    expect(screen.getByTestId('team-row-kembs-fftt')).toBeTruthy()
    expect(screen.queryByTestId('team-row-kembs-agr')).toBeNull()

    fireEvent.press(screen.getByTestId('federation-agr'))
    expect(screen.getByTestId('team-row-kembs-agr')).toBeTruthy()
    expect(screen.queryByTestId('team-row-kembs-fftt')).toBeNull()
  })
})

describe('Équipes, club d’une seule fédération', () => {
  it('shows no switch, and opens on its own federation’s phase', () => {
    as('landser')
    render(<EquipesScreen />)
    expect(screen.queryByTestId('federation-switch')).toBeNull()
    expect(screen.getByTestId('team-row-landser-agr')).toBeTruthy()
  })
})
