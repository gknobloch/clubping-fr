import { Alert } from 'react-native'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { givenParams, resetParams, setParams, useParams } from '@/__tests__/support/routeParams'
import type { Club, MemberGroup, Phase, Player, Season, User } from '@shared/types'
import { PlayerDetail } from '@/components/PlayerDetail'
import ClubScreen from '@/app/(tabs)/club'
import JoueursScreen from '@/app/(tabs)/joueurs'

// ---------------------------------------------------------------------------
// Les groupes d'un club, dans l'app (#602)
//
// Trois écrans : l'onglet Club, où tout le monde les lit et où un
// administrateur les crée et les remplit ; la liste Joueurs, que chacun filtre
// par groupe, en OU ou en ET ; et la fiche, qui dit dans quels groupes est le
// licencié. Les règles elles-mêmes sont dans src/lib/memberGroups.spec.ts, et
// les écritures dans la suite de l'API.
// ---------------------------------------------------------------------------
const mockData: Record<string, unknown> = {}
const mockAuth: { user: User | null } = { user: null }
const mockPush = jest.fn()
// Recorded as well as applied: the fiche in a pane filters the list beside it.
const mockSetParams = jest.fn((next: Record<string, string | undefined>) => setParams(next))
const mockUseParams = useParams

jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockUseParams(),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const phase: Phase = {
  id: 'ph1', seasonId: 's1', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active',
}
const season: Season = { id: 's1', displayName: '2026/2027', status: 'active' }

const player = (id: string, firstName: string, lastName: string): Player => ({
  id, firstName, lastName, licenseNumber: id, phone: '', status: 'active', clubId: 'c1',
})
const PLAYERS = [
  player('p1', 'Anna', 'Bureau'),
  player('p2', 'Bruno', 'Both'),
  player('p3', 'Chloé', 'Jeune'),
  player('p4', 'David', 'Aucun'),
]
const USERS: User[] = [
  ...PLAYERS.map((p): User => ({ ...p, role: 'player', isPlayer: true })),
  { id: 'ca', role: 'club_admin', isPlayer: false, clubId: 'c1', firstName: 'Virginie', lastName: 'Barlinge', status: 'active' },
]
const GROUPS: MemberGroup[] = [
  { id: 'g-jeunes', clubId: 'c1', displayName: 'Jeunes', memberIds: ['p2', 'p3'] },
  { id: 'g-bureau', clubId: 'c1', displayName: 'Bureau', memberIds: ['p1', 'p2', 'ca'] },
]

const signIn = (role: User['role']) => {
  mockAuth.user = { id: role === 'club_admin' ? 'ca' : 'p4', role, isPlayer: role === 'player', clubId: 'c1' }
}

let fns: Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  resetParams()
  fns = {
    addMemberGroup: jest.fn(async (_club: string, name: string) => ({
      ok: true, group: { id: 'g-new', clubId: 'c1', displayName: name, memberIds: [] },
    })),
    renameMemberGroup: jest.fn(async () => ({ ok: true, group: GROUPS[0] })),
    deleteMemberGroup: jest.fn(),
    setMemberGroupMembers: jest.fn(),
    setGroupsOfMember: jest.fn(),
  }
  Object.assign(mockData, {
    players: PLAYERS, users: USERS, clubs: [club], teams: [], phases: [phase], seasons: [season],
    playerPhasePoints: [], playerSeasonCategories: [], playerSeasonLicences: [],
    matchDays: [], games: [], gameSelections: [],
    memberGroups: GROUPS, refreshing: false, refresh: jest.fn(), updatePlayer: jest.fn(),
    ...fns,
  })
  signIn('player')
})

/** Who the Joueurs list shows, by last name. */
const listed = () =>
  PLAYERS.filter((p) => screen.queryByTestId(`player-row-${p.id}`)).map((p) => p.lastName)

describe('Joueurs — filtrer par groupe', () => {
  it('offre les groupes du club, dans l’ordre alphabétique, et compte toujours', () => {
    render(<JoueursScreen />)
    expect(screen.getByTestId('players-count')).toHaveTextContent('4 joueurs')
    expect(screen.getByPlaceholderText('Rechercher un joueur')).toBeTruthy()
    expect(screen.getByTestId('group-chip-g-bureau')).toBeTruthy()
    expect(screen.getByTestId('group-chip-g-jeunes')).toBeTruthy()
    expect(listed()).toEqual(['Bureau', 'Both', 'Jeune', 'Aucun'])
  })

  it('réduit la liste à un groupe, et dit combien il en reste', () => {
    render(<JoueursScreen />)
    fireEvent.press(screen.getByTestId('group-chip-g-bureau'))
    expect(listed()).toEqual(['Bureau', 'Both'])
    expect(screen.getByTestId('players-count')).toHaveTextContent('2 joueurs')
  })

  it('combine deux groupes en OU, puis en ET à la demande', () => {
    render(<JoueursScreen />)
    fireEvent.press(screen.getByTestId('group-chip-g-bureau'))
    // L'interrupteur n'apparaît qu'une fois qu'il veut dire quelque chose.
    expect(screen.queryByTestId('group-match-switch')).toBeNull()
    fireEvent.press(screen.getByTestId('group-chip-g-jeunes'))
    // Éteint, et le libellé dit ce qu'éteint veut dire.
    expect(screen.getByTestId('group-match-switch').props.value).toBe(false)
    expect(screen.getByText('Au moins un groupe')).toBeTruthy()
    expect(listed()).toEqual(['Bureau', 'Both', 'Jeune'])

    fireEvent(screen.getByTestId('group-match-switch'), 'valueChange', true)
    expect(screen.getByText('Tous les groupes')).toBeTruthy()
    expect(listed()).toEqual(['Both'])
    expect(screen.getByTestId('players-count')).toHaveTextContent('1 joueur')
  })

  it('s’ouvre déjà filtré depuis l’onglet Club, et s’efface', () => {
    givenParams({ groupes: 'g-jeunes' })
    render(<JoueursScreen />)
    expect(listed()).toEqual(['Both', 'Jeune'])

    fireEvent.press(screen.getByTestId('group-filter-clear'))
    expect(listed()).toEqual(['Bureau', 'Both', 'Jeune', 'Aucun'])
  })

  it('ne montre rien quand le club n’a aucun groupe', () => {
    mockData.memberGroups = []
    render(<JoueursScreen />)
    expect(screen.queryByTestId('group-chip-g-bureau')).toBeNull()
  })
})

describe('Joueurs — un club à dix groupes', () => {
  beforeEach(() => {
    mockData.memberGroups = [
      ...GROUPS,
      ...['Arbitres', 'Baby-ping', 'Compétiteurs Seniors', 'Entraîneurs', 'Féminines', 'Loisirs', 'Vétérans', 'Comité']
        .map((displayName, i): MemberGroup => ({
          id: `g-x${i}`, clubId: 'c1', displayName,
          memberIds: displayName === 'Vétérans' ? ['p4'] : [],
        })),
    ]
  })

  it('montre ce qui tient sur deux lignes et replie le reste en « +N »', () => {
    render(<JoueursScreen />)
    expect(screen.getByTestId('group-chip-g-x0')).toBeTruthy() // Arbitres
    expect(screen.queryByTestId('group-chip-g-x6')).toBeNull() // Vétérans, replié
    expect(screen.getByTestId('group-filter-more')).toHaveTextContent('+6')
  })

  it('choisit un groupe replié dans la feuille, qui lui rend sa pastille', () => {
    render(<JoueursScreen />)
    fireEvent.press(screen.getByTestId('group-filter-more'))
    fireEvent.press(screen.getByTestId('group-pick-g-x6'))
    fireEvent.press(screen.getByTestId('group-filter-sheet-save'))

    expect(listed()).toEqual(['Aucun'])
    expect(screen.getByTestId('group-chip-g-x6')).toBeTruthy()
    expect(screen.getByTestId('group-filter-more')).toHaveTextContent('+5')
  })
})

describe('la fiche — ses groupes', () => {
  it('dit dans quels groupes est le licencié, chacun ouvrant la liste filtrée', () => {
    render(<PlayerDetail playerId="p2" />)
    const section = screen.getByTestId('player-groups')
    expect(within(section).getByText('Bureau')).toBeTruthy()
    expect(within(section).getByText('Jeunes')).toBeTruthy()

    // Pushed onto the same stack as the fiche, so the chevron comes back to
    // it — `/joueurs` is a tab, and switching tabs has no way back.
    fireEvent.press(screen.getByTestId('player-group-g-jeunes'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/membres', params: { groupes: 'g-jeunes' } })
  })

  it('filtre la liste d’à côté, en place, quand la fiche est un volet', () => {
    render(<PlayerDetail playerId="p2" embedded />)
    fireEvent.press(screen.getByTestId('player-group-g-jeunes'))

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockSetParams).toHaveBeenCalledWith({ groupes: 'g-jeunes', mode: '' })
  })

  it('le dit aussi quand il n’est dans aucun', () => {
    render(<PlayerDetail playerId="p4" />)
    expect(within(screen.getByTestId('player-groups')).getByText('Dans aucun groupe.')).toBeTruthy()
  })

  it('n’offre pas « Modifier » à un joueur', () => {
    render(<PlayerDetail playerId="p2" />)
    expect(screen.queryByTestId('edit-groups')).toBeNull()
  })

  it('laisse l’administrateur du club ranger le licencié', () => {
    signIn('club_admin')
    render(<PlayerDetail playerId="p4" />)

    fireEvent.press(screen.getByTestId('edit-groups'))
    fireEvent.press(screen.getByTestId('check-g-jeunes'))
    fireEvent.press(screen.getByTestId('groups-sheet-save'))

    expect(fns.setGroupsOfMember).toHaveBeenCalledWith('c1', 'p4', ['g-jeunes'])
  })

  it('n’affiche pas la section tant que le club n’a aucun groupe', () => {
    mockData.memberGroups = []
    render(<PlayerDetail playerId="p2" />)
    expect(screen.queryByTestId('player-groups')).toBeNull()
  })
})

describe('l’onglet Club — les groupes', () => {
  it('les liste pour tout membre, et ouvre les joueurs de l’un d’eux', () => {
    render(<ClubScreen />)
    expect(within(screen.getByTestId('club-groups')).getByText('3 membres')).toBeTruthy()

    fireEvent.press(screen.getByTestId('club-group-g-bureau'))
    // Sur la pile du Club : le retour y ramène, et l'onglet Club reste allumé.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/club/membres', params: { groupes: 'g-bureau' } })
  })

  it('ne donne à un joueur aucun moyen de les changer', () => {
    render(<ClubScreen />)
    expect(screen.queryByTestId('club-group-new')).toBeNull()
    expect(screen.queryByTestId('club-group-edit-g-bureau')).toBeNull()
    expect(screen.queryByTestId('club-group-delete-g-bureau')).toBeNull()
  })

  it('épargne la section à un joueur dont le club n’a aucun groupe', () => {
    mockData.memberGroups = []
    render(<ClubScreen />)
    expect(screen.queryByTestId('club-groups')).toBeNull()
  })

  it('crée un groupe avec ses membres d’un seul geste', async () => {
    signIn('club_admin')
    render(<ClubScreen />)

    fireEvent.press(screen.getByTestId('club-group-new'))
    // La feuille du capitaine : compte dans le titre, Enregistrer en bas —
    // qui attend un nom.
    expect(screen.getByTestId('group-edit-save').props.accessibilityState).toMatchObject({ disabled: true })
    fireEvent.changeText(screen.getByTestId('group-edit-name'), 'Loisirs')
    // Les non-licenciés sont des membres aussi.
    fireEvent.press(screen.getByTestId('group-member-ca'))
    fireEvent.press(screen.getByTestId('group-member-p4'))
    expect(screen.getByTestId('group-edit-title')).toHaveTextContent('Nouveau groupe (2)')
    await act(async () => { fireEvent.press(screen.getByTestId('group-edit-save')) })

    expect(fns.addMemberGroup).toHaveBeenCalledWith('c1', 'Loisirs')
    expect(fns.setMemberGroupMembers).toHaveBeenCalledWith('c1', 'g-new', ['p4', 'ca'])
  })

  it('garde la feuille ouverte sur un nom déjà pris, sans rien écrire', async () => {
    signIn('club_admin')
    fns.addMemberGroup.mockResolvedValueOnce({ ok: false, message: 'Le club a déjà un groupe de ce nom.' })
    render(<ClubScreen />)

    fireEvent.press(screen.getByTestId('club-group-new'))
    fireEvent.changeText(screen.getByTestId('group-edit-name'), 'bureau')
    fireEvent.press(screen.getByTestId('group-member-p4'))
    await act(async () => { fireEvent.press(screen.getByTestId('group-edit-save')) })

    expect(screen.getByText('Le club a déjà un groupe de ce nom.')).toBeTruthy()
    // La feuille reste ouverte.
    expect(screen.getByTestId('group-edit-name')).toBeTruthy()
    expect(fns.setMemberGroupMembers).not.toHaveBeenCalled()
  })

  it('n’écrit que les membres quand le nom n’a pas bougé', async () => {
    signIn('club_admin')
    render(<ClubScreen />)

    fireEvent.press(screen.getByTestId('club-group-edit-g-jeunes'))
    fireEvent.press(screen.getByTestId('group-member-p3'))
    await act(async () => { fireEvent.press(screen.getByTestId('group-edit-save')) })

    expect(fns.renameMemberGroup).not.toHaveBeenCalled()
    expect(fns.setMemberGroupMembers).toHaveBeenCalledWith('c1', 'g-jeunes', ['p2'])
  })

  it('n’offre plus de suppression dans l’éditeur', () => {
    signIn('club_admin')
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-group-edit-g-jeunes'))
    expect(screen.queryByTestId('group-edit-delete')).toBeNull()
  })

  it('demande avant de supprimer, depuis la ligne du groupe', () => {
    signIn('club_admin')
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.()
    })
    render(<ClubScreen />)

    // Sur la ligne du groupe, plus dans l'éditeur.
    fireEvent.press(screen.getByTestId('club-group-delete-g-jeunes'))

    expect(alert.mock.calls[0][1]).toContain('Ses membres restent au club')
    expect(fns.deleteMemberGroup).toHaveBeenCalledWith('c1', 'g-jeunes')
    alert.mockRestore()
  })
})
