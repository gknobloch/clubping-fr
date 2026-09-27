import { Alert } from 'react-native'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import { resetParams, setParams, useParams } from '@/__tests__/support/routeParams'
import { PHONE_WIDTH, TABLET_LANDSCAPE, resetWindowSize, setWindowSize } from '@/__tests__/support/window'
import type { Club, Competition, Division, MemberGroup, Player, Team, User } from '@shared/types'
import ClubScreen from '@/app/(tabs)/club'

// ---------------------------------------------------------------------------
// L'onglet Club en sections (#604)
//
// Aperçu, Canaux, Administrateurs, Groupes, Compétitions — empilées sur un
// téléphone, un rail et une section sur une tablette. Ce qui est épinglé ici :
// ce que chaque section permet à qui, et que le rail choisit bien la section.
// ---------------------------------------------------------------------------
const mockData: Record<string, unknown> = {}
const mockAuth: { user: User | null } = { user: null }
const mockPush = jest.fn()
const mockSetParams = setParams
const mockUseParams = useParams

jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockUseParams(),
}))

const club: Club = {
  id: 'c1', affiliationNumber: '06680011', displayName: 'Rixheim PPA', isArchived: false,
  addresses: [],
  channels: [{ id: 'ch1', type: 'whatsapp', link: 'https://chat.whatsapp.com/x', displayName: 'PPA (Seniors)', sortOrder: 0 }],
}
const player = (id: string, firstName: string, lastName: string): Player => ({
  id, firstName, lastName, licenseNumber: id, phone: '', status: 'active', clubId: 'c1',
})
const PLAYERS = [player('p1', 'Anna', 'Bureau'), player('p2', 'Bruno', 'Both'), player('p3', 'Chloé', 'Jeune')]
const admin = (id: string, firstName: string, lastName: string): User =>
  ({ id, role: 'club_admin', isPlayer: true, clubId: 'c1', firstName, lastName, status: 'active' })
const seniors: Competition = { id: 'comp-sen', displayName: 'Championnat par équipes', categories: [], sortOrder: 1, isArchived: false }
const veterans: Competition = { id: 'comp-vet', displayName: 'Championnat vétérans', categories: ['V50'], sortOrder: 2, isArchived: false }
const division: Division = { id: 'd1', phaseId: 'ph', displayName: 'D1', rank: 1, playersPerGame: 4, isArchived: false, competitionId: 'comp-sen' }
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph', number: 1, divisionId: 'd1', groupId: 'grp',
  gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', isArchived: false, playerIds: ['p2', 'p3'],
}
const coaches: MemberGroup = { id: 'g1', clubId: 'c1', displayName: 'Entraîneurs', memberIds: ['p1', 'p2'] }

let fns: Record<string, jest.Mock>

const signIn = (role: User['role']) => {
  mockAuth.user = { id: role === 'club_admin' ? 'a1' : 'p3', role, isPlayer: true, clubId: 'c1' }
}

beforeEach(() => {
  jest.clearAllMocks()
  resetParams()
  setWindowSize(PHONE_WIDTH)
  fns = {
    addClubChannel: jest.fn(), updateClubChannel: jest.fn(), deleteClubChannel: jest.fn(),
    addClubAdmin: jest.fn(async () => ({ ok: true })), removeClubAdmin: jest.fn(async () => ({ ok: true })),
    setCompetitionGroup: jest.fn(), setMemberGroupMembers: jest.fn(),
    addMemberGroup: jest.fn(), renameMemberGroup: jest.fn(), deleteMemberGroup: jest.fn(),
  }
  Object.assign(mockData, {
    clubs: [club],
    users: [admin('a1', 'Virginie', 'Barlinge'), admin('a2', 'Grégory', 'Canaque'),
      ...PLAYERS.map((p): User => ({ ...p, role: 'player', isPlayer: true }))],
    players: PLAYERS, teams: [team], divisions: [division], competitions: [seniors, veterans],
    memberGroups: [coaches], competitionGroups: [], gameSelections: [], seasons: [], playerSeasonCategories: [],
    refreshing: false, refresh: jest.fn(),
    ...fns,
  })
  signIn('club_admin')
})
afterEach(resetWindowSize)

describe('Canaux — modifiables par l’administrateur', () => {
  it('ajoute un canal, lien complété d’un https://', () => {
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-channel-new'))
    fireEvent.press(screen.getByTestId('channel-type-website'))
    fireEvent.changeText(screen.getByTestId('channel-edit-link'), 'rixheim-ppa.fr')
    fireEvent.press(screen.getByTestId('channel-edit-save'))
    expect(fns.addClubChannel).toHaveBeenCalledWith('c1', { type: 'website', link: 'https://rixheim-ppa.fr', displayName: '' })
  })

  it('modifie et supprime — après confirmation', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.())
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-channel-edit-ch1'))
    fireEvent.changeText(screen.getByTestId('channel-edit-name'), 'Seniors')
    fireEvent.press(screen.getByTestId('channel-edit-save'))
    expect(fns.updateClubChannel).toHaveBeenCalledWith('c1', 'ch1', expect.objectContaining({ displayName: 'Seniors' }))

    fireEvent.press(screen.getByTestId('club-channel-delete-ch1'))
    expect(fns.deleteClubChannel).toHaveBeenCalledWith('c1', 'ch1')
    alert.mockRestore()
  })

  it('ne donne à un joueur que la lecture', () => {
    signIn('player')
    render(<ClubScreen />)
    expect(screen.getByText('PPA (Seniors)')).toBeTruthy()
    expect(screen.queryByTestId('club-channel-new')).toBeNull()
    expect(screen.queryByTestId('club-channel-edit-ch1')).toBeNull()
  })
})

describe('Administrateurs', () => {
  it('les liste pour tous, compte contre le plafond', () => {
    signIn('player')
    render(<ClubScreen />)
    const section = screen.getByTestId('club-admins')
    expect(within(section).getByText('Administrateurs · 2 / 5')).toBeTruthy()
    expect(within(section).getByText('Virginie Barlinge')).toBeTruthy()
    expect(screen.queryByTestId('club-admin-new')).toBeNull()
  })

  it('désigne un membre, après confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.text === 'Désigner')?.onPress?.())
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-admin-new'))
    await act(async () => { fireEvent.press(screen.getByTestId('admin-pick-p1')) })
    expect(fns.addClubAdmin).toHaveBeenCalledWith('c1', 'p1')
    alert.mockRestore()
  })

  // The API's sentence, not one the screen made up.
  it('montre le refus de l’API tel quel', async () => {
    fns.removeClubAdmin.mockResolvedValueOnce({ ok: false, message: 'Refusé par le serveur.' })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.())
    render(<ClubScreen />)
    await act(async () => { fireEvent.press(screen.getByTestId('club-admin-remove-a2')) })
    expect(alert).toHaveBeenLastCalledWith('Impossible', 'Refusé par le serveur.')
    alert.mockRestore()
  })

  it('ne propose pas de retirer le dernier', () => {
    mockData.users = [admin('a1', 'Virginie', 'Barlinge')]
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-admin-remove-a1'))
    expect(alert.mock.calls[0][0]).toBe('Dernier administrateur')
    expect(fns.removeClubAdmin).not.toHaveBeenCalled()
    alert.mockRestore()
  })
})

describe('Compétitions', () => {
  it('montre celles que le club joue, et replie les autres', () => {
    render(<ClubScreen />)
    expect(screen.getByTestId('competition-comp-sen')).toBeTruthy()
    expect(screen.queryByTestId('competition-comp-vet')).toBeNull()
    fireEvent.press(screen.getByTestId('club-competitions-others'))
    expect(screen.getByTestId('competition-comp-vet')).toBeTruthy()
  })

  it('réserve à un groupe, en demandant pour qui une équipe aligne déjà', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.text === 'Réserver')?.onPress?.())
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('competition-group-comp-sen'))
    await act(async () => { fireEvent.press(screen.getByTestId('group-choice-g1')) })
    // Chloé is on team 1's roster, and not a coach.
    expect(alert.mock.calls[0][1]).toContain('Chloé Jeune')
    expect(fns.setCompetitionGroup).toHaveBeenCalledWith('c1', 'comp-sen', 'g1')
    alert.mockRestore()
  })

  // The case the section is for: fielded, outside the group — reviewed one by
  // one, or all at once.
  describe('les engagés hors du groupe', () => {
    beforeEach(() => {
      // Both Bruno (in the group) and Chloé are on team 1; Anna is not fielded.
      mockData.competitionGroups = [{ clubId: 'c1', competitionId: 'comp-sen', groupId: 'g1' }]
      mockData.memberGroups = [{ ...coaches, memberIds: ['p1'] }]
    })

    it('ne signale que les joueurs engagés qui manquent au groupe', () => {
      render(<ClubScreen />)
      expect(screen.getByTestId('competition-conflicts-comp-sen'))
        .toHaveTextContent(/2 joueurs engagés hors du groupe : Bruno Both, Chloé Jeune/)
    })

    it('en ajoute un seul, choisi', () => {
      render(<ClubScreen />)
      fireEvent.press(screen.getByTestId('competition-fix-comp-sen'))
      fireEvent.press(screen.getByTestId('competition-missing-p3'))
      fireEvent.press(screen.getByTestId('competition-missing-save'))
      expect(fns.setMemberGroupMembers).toHaveBeenCalledWith('c1', 'g1', ['p1', 'p3'])
    })

    it('les ajoute tous d’un coup', () => {
      render(<ClubScreen />)
      fireEvent.press(screen.getByTestId('competition-fix-comp-sen'))
      fireEvent.press(screen.getByTestId('competition-missing-all'))
      expect(screen.getByTestId('competition-missing-title')).toHaveTextContent('Engagés hors du groupe (2)')
      fireEvent.press(screen.getByTestId('competition-missing-save'))
      expect(fns.setMemberGroupMembers).toHaveBeenCalledWith('c1', 'g1', ['p1', 'p2', 'p3'])
    })

    it('ne dit rien sans groupe : rien n’est restreint', () => {
      mockData.competitionGroups = []
      render(<ClubScreen />)
      expect(screen.queryByTestId('competition-conflicts-comp-sen')).toBeNull()
    })
  })
})

describe('sur une tablette, un rail', () => {
  beforeEach(() => setWindowSize(TABLET_LANDSCAPE))

  it('ouvre sur l’aperçu, et montre la section choisie', () => {
    render(<ClubScreen />, { metrics: TABLET })
    expect(screen.getByTestId('club-rail')).toBeTruthy()
    expect(screen.getByTestId('club-identity')).toBeTruthy()
    expect(screen.queryByTestId('club-admins')).toBeNull()

    fireEvent.press(screen.getByTestId('club-rail-administrateurs'))
    expect(screen.getByTestId('club-admins')).toBeTruthy()
    expect(screen.queryByTestId('club-identity')).toBeNull()
  })

  it('n’offre pas les Groupes à un membre dont le club n’en a aucun', () => {
    signIn('player')
    mockData.memberGroups = []
    render(<ClubScreen />, { metrics: TABLET })
    expect(screen.queryByTestId('club-rail-groupes')).toBeNull()
  })
})
