import { fireEvent, screen, waitFor } from '@testing-library/react-native'
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
const setGameSelection = jest.fn().mockResolvedValue(undefined)

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
  setGameSelection,
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
const keeper: Player = { ...captain, id: 'p9', firstName: 'Jade', lastName: 'Robert', licenseNumber: '9900099' }

const phase: Phase = {
  id: 'ph1', seasonId: 's1', name: 'phase1', displayName: '2026/2027 Phase 1', status: 'active',
}
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 3, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p1',
  isArchived: false, playerIds: ['p1', 'p2'],
}
/** A second club team in the same round, so a player has somewhere to go. */
const teamB: Team = {
  ...team, id: 't2', number: 4, groupId: 'grp2', captainId: 'p9', playerIds: ['p9'],
}
const opponents: Team[] = [4, 5, 6, 7].map((n) => ({
  ...team, id: `opp${n}`, clubId: 'c2', number: n, playerIds: [],
}))
const opponentsB: Team[] = [4, 5, 6, 7].map((n) => ({
  ...team, id: `oppB${n}`, clubId: 'c2', number: n + 10, groupId: 'grp2', playerIds: [],
}))

/** Four journées, so the pager has somewhere to go from either end. */
const NUMBERS = [1, 2, 3, 4]
const matchDaysFor = (): MatchDay[] =>
  NUMBERS.map((n) => ({ id: `md${n}`, groupId: 'grp1', number: n, date: `2099-01-0${n + 2}` }))
const gamesFor = (): Game[] =>
  NUMBERS.map((n) => ({
    id: `g${n}`, matchDayId: `md${n}`, homeTeamId: 't1', awayTeamId: `opp${n + 3}`, time: '16h00',
  }))

/**
 * The club's second team, in its own poule — added only where a player needs
 * somewhere to be moved to. One section per team, so leaving it in the base
 * fixture would double every count the tests above read.
 */
function addSecondClubTeam() {
  mockData.teams = [...mockData.teams, teamB, ...opponentsB]
  mockData.players = [...mockData.players, keeper]
  mockData.groups = [
    ...mockData.groups,
    { id: 'grp2', divisionId: 'd1', number: 2, teamIds: ['t2', ...opponentsB.map((t) => t.id)], isArchived: false },
  ]
  mockData.matchDays = [
    ...mockData.matchDays,
    ...NUMBERS.map((n) => ({ id: `mdB${n}`, groupId: 'grp2', number: n, date: `2099-01-0${n + 2}` })),
  ]
  mockData.games = [
    ...mockData.games,
    ...NUMBERS.map((n) => ({
      id: `gB${n}`, matchDayId: `mdB${n}`, homeTeamId: 't2', awayTeamId: `oppB${n + 3}`, time: '16h00',
    })),
  ]
}

beforeEach(() => {
  mockPush.mockClear()
  setAvailability.mockClear()
  clearAvailability.mockClear()
  setGameSelection.mockClear()
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

// ---------------------------------------------------------------------------
// Aligner depuis la grille (#468)
//
// Read-only in the first pass, and that was the wrong call: the desktop lets a
// captain say which team a player turns out for straight from the matrix, and
// that is half of what the screen is for.
// ---------------------------------------------------------------------------
describe('la composition depuis la grille', () => {
  beforeEach(addSecondClubTeam)

  const openCompo = () => {
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)
    fireEvent.press(screen.getByTestId('compo-p1-0'))
  }

  it('offre les équipes du club qui jouent cette journée', () => {
    openCompo()

    expect(screen.getByTestId('compose-team-t1')).toBeTruthy()
    expect(screen.getByTestId('compose-team-t2')).toBeTruthy()
    // An opponent's team is nobody's to be picked for.
    expect(screen.queryByTestId('compose-team-opp4')).toBeNull()
  })

  it('aligne le joueur dans l’équipe choisie', async () => {
    openCompo()
    fireEvent.press(screen.getByTestId('compose-team-t1'))

    await waitFor(() => expect(setGameSelection).toHaveBeenCalledWith('t1', 'g1', ['p1']))
  })

  it('le sort de son ancienne équipe en l’alignant dans une autre', async () => {
    // Two writes, not one: a player fielded twice the same journée is exactly
    // what the brûlage rules exist to prevent. And the team he joins keeps the
    // players already in it.
    mockData.gameSelections = [
      { teamId: 't1', gameId: 'g1', playerIds: ['p1', 'p2'] },
      { teamId: 't2', gameId: 'gB1', playerIds: ['p9'] },
    ]
    openCompo()

    fireEvent.press(screen.getByTestId('compose-team-t2'))

    await waitFor(() => expect(setGameSelection).toHaveBeenCalledTimes(2))
    expect(setGameSelection).toHaveBeenCalledWith('t1', 'g1', ['p2'])
    expect(setGameSelection).toHaveBeenCalledWith('t2', 'gB1', ['p9', 'p1'])
  })

  it('le retire de toute équipe', async () => {
    mockData.gameSelections = [{ teamId: 't1', gameId: 'g1', playerIds: ['p1'] }]
    openCompo()

    fireEvent.press(screen.getByTestId('compose-none'))

    await waitFor(() => expect(setGameSelection).toHaveBeenCalledWith('t1', 'g1', []))
    expect(setGameSelection).toHaveBeenCalledTimes(1)
  })

  it('ne touche que les listes qui changent', async () => {
    // The web batches every game of the day; sending the unchanged ones would
    // be writes for nothing.
    openCompo()
    fireEvent.press(screen.getByTestId('compose-team-t1'))

    await waitFor(() => expect(setGameSelection).toHaveBeenCalledTimes(1))
  })

  it('reste fermé à qui ne compose pas', () => {
    // A plain member of the team: `canManageTeam` says no, and the cell is
    // inert rather than opening a sheet that could not save.
    mockAuth.user = { ...mate, role: 'player', isPlayer: true, clubId: 'c1' } as User
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)

    fireEvent.press(screen.getByTestId('compo-p1-0'))

    expect(screen.queryByTestId('composition-sheet')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Autres joueurs du club (#476)
//
// The web's last section, missing from the app's grid: the club's active
// players who are in no roster of the phase. Without it the only way to field
// one of them is to open a match and know the name in advance — the grid is
// where the desktop lets you find it.
// ---------------------------------------------------------------------------
describe('les autres joueurs du club', () => {
  /** In the club, in no team: exactly what the section is for. */
  const spare: Player = {
    ...captain, id: 'p7', firstName: 'Hugo', lastName: 'Bernard', licenseNumber: '9900077',
  }

  const renderTablet = () => {
    setWindowSize(TABLET_SMALL)
    render(<JourneesScreen />, { metrics: TABLET })
    layoutAt(LANDSCAPE)
  }

  beforeEach(() => {
    mockData.players = [...mockData.players, spare]
  })

  it('donne une ligne au joueur d’aucune équipe', () => {
    renderTablet()

    expect(screen.getByText('Autres joueurs du club')).toBeTruthy()
    expect(screen.getByTestId('matrix-row-p7')).toBeTruthy()
  })

  it('ne montre pas les joueurs déjà dans un effectif', () => {
    // p1 and p2 have their rows in the team's own section; a second one here
    // would be the same player twice on one screen.
    renderTablet()

    const section = screen.getByText('Autres joueurs du club')
    expect(section).toBeTruthy()
    expect(screen.getAllByTestId('matrix-row-p1')).toHaveLength(1)
  })

  it('se tait quand tout le club est réparti', () => {
    mockData.players = [captain, mate]

    renderTablet()

    expect(screen.queryByText('Autres joueurs du club')).toBeNull()
  })

  it('n’offre pas de disponibilité, faute de match à eux', () => {
    renderTablet()

    expect(screen.queryByTestId('dispo-p7-0')).toBeNull()
    expect(screen.getByTestId('compo-p7-0')).toBeTruthy()
  })

  it('aligne un de ces joueurs depuis la colonne Compo', async () => {
    renderTablet()

    fireEvent.press(screen.getByTestId('compo-p7-0'))
    fireEvent.press(screen.getByTestId('compose-team-t1'))

    await waitFor(() => expect(setGameSelection).toHaveBeenCalledWith('t1', 'g1', ['p7']))
  })

  it('reste inerte pour qui ne compose aucune équipe du club', () => {
    // A plain member: `canManageTeam` says no for every team playing the round.
    mockAuth.user = { ...mate, role: 'player', isPlayer: true, clubId: 'c1' } as User

    renderTablet()
    fireEvent.press(screen.getByTestId('compo-p7-0'))

    expect(screen.queryByTestId('composition-sheet')).toBeNull()
  })

  it('filtre par nom au-delà de dix joueurs', () => {
    // The club minus the rosters is the longest list on the screen (#454).
    mockData.players = [
      ...mockData.players,
      ...Array.from({ length: 12 }, (_, i) => ({
        ...captain, id: `x${i}`, firstName: 'Alex', lastName: `Durand${i}`, licenseNumber: `99001${i}`,
      })),
    ]

    renderTablet()
    fireEvent.changeText(screen.getByTestId('matrix-search'), 'Bernard')

    expect(screen.getByTestId('matrix-row-p7')).toBeTruthy()
    expect(screen.queryByTestId('matrix-row-x0')).toBeNull()
  })

  it('garde la liste entière en deçà du seuil', () => {
    renderTablet()

    expect(screen.queryByTestId('matrix-search')).toBeNull()
  })
})
