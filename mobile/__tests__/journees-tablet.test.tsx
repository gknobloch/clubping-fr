import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import type {
  Club, Division, Game, Group, MatchDay, Phase, Player, Team, User,
} from '@shared/types'
import JourneesScreen from '@/app/(tabs)/journees'

// ---------------------------------------------------------------------------
// Journées : la matrice au-dessus du seuil tablette (#468)
//
// The phone shows one journée at a time behind a stepper. A slab shows two or
// three at once, per team, which is the question the stepper cannot answer —
// «qui est dispo sur les prochaines journées».
//
// What these pin is the seam: which of the two layouts you get, how many
// journées the width buys, that the pager moves one journée at a time rather
// than one page, and that a cell actually records an answer.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()
const setAvailability = jest.fn().mockResolvedValue(undefined)
const clearAvailability = jest.fn().mockResolvedValue(undefined)

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
  gameAvailabilities: [] as { playerId: string; gameId: string; status: string }[],
  gameSelections: [] as { teamId: string; gameId: string; playerIds: string[] }[],
  playerPhasePoints: [] as never[],
  setAvailability,
  clearAvailability,
  refreshing: false,
  refresh: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const opponentClub: Club = { ...club, id: 'c2', displayName: 'Kembs TT' }

const captain: Player = {
  id: 'p1', firstName: 'Louis', lastName: 'Thomas', licenseNumber: '9900031',
  phone: '0600000000', status: 'active', clubId: 'c1',
}
const mate: Player = { ...captain, id: 'p2', firstName: 'Inès', lastName: 'Martin', licenseNumber: '9900014' }

const phase: Phase = {
  id: 'ph1', seasonId: 's1', name: 'phase1', displayName: '2026/2027 Phase 1', status: 'active',
}
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 3, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p1',
  isArchived: false, playerIds: ['p1', 'p2'],
}
const opponents: Team[] = [4, 5, 6, 7].map((n) => ({
  ...team, id: `opp${n}`, clubId: 'c2', number: n, playerIds: [],
}))

/** Four journées, so the pager has somewhere to go from either end. */
const NUMBERS = [1, 2, 3, 4]
const matchDaysFor = (): MatchDay[] =>
  NUMBERS.map((n) => ({ id: `md${n}`, groupId: 'grp1', number: n, date: `2099-01-0${n + 2}` }))
const gamesFor = (): Game[] =>
  NUMBERS.map((n) => ({
    id: `g${n}`, matchDayId: `md${n}`, homeTeamId: 't1', awayTeamId: `opp${n + 3}`, time: '16h00',
  }))

beforeEach(() => {
  mockPush.mockClear()
  setAvailability.mockClear()
  clearAvailability.mockClear()
  mockAuth.user = { ...captain, role: 'player', isPlayer: true } as User
  mockData.clubs = [club, opponentClub]
  mockData.teams = [team, ...opponents]
  mockData.players = [captain, mate]
  mockData.phases = [phase]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 3', rank: 3, playersPerGame: 4, isArchived: false },
  ]
  mockData.groups = [
    { id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', ...opponents.map((t) => t.id)], isArchived: false },
  ]
  mockData.matchDays = matchDaysFor()
  mockData.games = gamesFor()
  mockData.gameAvailabilities = []
  mockData.gameSelections = []
})

afterEach(resetWindowSize)

/** The grid measures its column; nothing lays out in a test unless told to. */
function layoutAt(width: number) {
  fireEvent(screen.getByTestId('matrix-column'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 600 } },
  })
}

/** 11" landscape and 11" portrait, as the screen measures them. */
const LANDSCAPE = 1074
const PORTRAIT = 802

describe('sur un téléphone', () => {
  it('garde les cartes et son sélecteur de journée', () => {
    setWindowSize(PHONE_WIDTH)

    render(<JourneesScreen />)

    expect(screen.getByText('Journée 1')).toBeTruthy()
    expect(screen.queryByTestId('matrix-column')).toBeNull()
  })
})

describe('sur une tablette', () => {
  it('remplace les cartes par la matrice', () => {
    setWindowSize(TABLET_SMALL)

    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    // One row per player of the team, not one card per match.
    expect(screen.getByTestId('matrix-row-p1')).toBeTruthy()
    expect(screen.getByTestId('matrix-row-p2')).toBeTruthy()
    // And the journée stepper is gone — the columns are the journées now.
    expect(screen.queryByText('Journée 1')).toBeNull()
  })

  it('montre trois journées couché et deux debout', () => {
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })

    layoutAt(LANDSCAPE)
    expect(screen.getAllByText(/^J[1-4]$/)).toHaveLength(3)

    layoutAt(PORTRAIT)
    expect(screen.getAllByText(/^J[1-4]$/)).toHaveLength(2)
  })

  it('avance d’une journée à la fois, pas d’une page', () => {
    // The difference that makes the portrait column count painless: J3 is one
    // press away, not one page. Four journées, three shown, so «1–3 / 4».
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    expect(screen.getByText('1–3 / 4')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Journées suivantes'))

    expect(screen.getByText('2–4 / 4')).toBeTruthy()
  })

  it('ouvre sur la journée active, encadrée', () => {
    // [précédente, courante, suivante] — not the season's first at the left.
    // Every fixture here is in 2099, so the active journée is J1 and there is
    // nothing before it to show.
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    expect(screen.getByText('1–3 / 4')).toBeTruthy()
  })

  it('enregistre une réponse depuis une cellule', () => {
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    // The captain's own cell for the first journée on screen.
    fireEvent.press(screen.getByTestId('dispo-p1-0'))
    fireEvent.press(screen.getByText('Oui'))

    // No provenance: answering for myself is also what clears an override.
    expect(setAvailability).toHaveBeenCalledWith('p1', 'g1', 'available', undefined)
  })

  it('note qui répond pour un coéquipier', () => {
    // The captain answering for a team-mate — the rule of #462, which the grid
    // must not quietly break.
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    fireEvent.press(screen.getByTestId('dispo-p2-0'))
    fireEvent.press(screen.getByText('Non'))

    expect(setAvailability).toHaveBeenCalledWith('p2', 'g1', 'unavailable', 'captain')
  })

  it('ne laisse pas un administrateur général répondre pour autrui', () => {
    // `canEditAvailability`, not `canManageTeam`: an availability is a personal
    // declaration and a general admin is not in that loop (#462).
    mockAuth.user = { ...mate, role: 'general_admin', isPlayer: true, clubId: 'c1' } as User
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    fireEvent.press(screen.getByTestId('dispo-p1-0'))

    expect(screen.queryByTestId('availability-sheet')).toBeNull()
  })

  it('mène au match, où se compose l’équipe', () => {
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    fireEvent.press(screen.getByText('J2'))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/match/[id]',
      params: { id: 'g2', teamId: 't1' },
    })
  })
})
