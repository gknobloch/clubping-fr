import { Linking } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Division, Phase, Player, Team, User } from '@shared/types'
import TeamDetailScreen from '@/app/(tabs)/(detail)/team/[id]'

// ---------------------------------------------------------------------------
// Fiche équipe — the WhatsApp group is an icon in the identity banner, not a
// section of its own, matching the web team cards (#388). Setting the link is
// still app-only, and moved into the team edit modal.
//
// Under __tests__/ rather than beside the screen: expo-router routes every
// file under app/, and a test there is bundled into the app.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null } = { user: null }
const updateTeam = jest.fn()
const mockData = {
  teams: [] as Team[],
  players: [] as Player[],
  clubs: [] as Club[],
  phases: [] as Phase[],
  divisions: [] as Division[],
  matchDays: [],
  games: [],
  gameSelections: [],
  updateTeam,
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useNavigation: () => ({ setOptions: jest.fn() }),
  useRouter: () => ({ push: jest.fn() }),
}))
// The logo is fetched over the network; the screen under test is the layout
// around it, not the image.
jest.mock('@/components/ClubLogo', () => ({ ClubLogo: () => null }))

const club: Club = {
  id: 'c1',
  affiliationNumber: '06680123',
  displayName: 'Rixheim PPA',
  isArchived: false,
  addresses: [],
  channels: [],
}

const captain: Player = {
  id: 'p1',
  firstName: 'Bo',
  lastName: 'Martin',
  licenseNumber: '681001',
  phone: '0600000000',
  status: 'active',
  clubId: 'c1',
}

const teammate: Player = { ...captain, id: 'p2', firstName: 'Lou', lastName: 'Dubois' }

const team: Team = {
  id: 't1',
  clubId: 'c1',
  phaseId: 'ph1',
  number: 3,
  divisionId: 'd1',
  groupId: 'g1',
  gameLocationId: 'a1',
  defaultDay: 'Vendredi',
  defaultTime: '20:00',
  captainId: 'p1',
  isArchived: false,
  playerIds: ['p1', 'p2'],
  whatsappLink: 'https://chat.whatsapp.com/xyz',
}

const asUser = (p: Player): User => ({ ...p, role: 'player', isPlayer: true })

let openURL: jest.SpiedFunction<typeof Linking.openURL>

beforeEach(() => {
  updateTeam.mockClear()
  mockAuth.user = asUser(teammate)
  mockData.teams = [team]
  mockData.players = [captain, teammate]
  mockData.clubs = [club]
  mockData.phases = [
    { id: 'ph1', seasonId: 's1', name: 'p1', displayName: '2026/2027 Phase 1', status: 'active' },
  ]
  mockData.divisions = [
    {
      id: 'd1',
      phaseId: 'ph1',
      displayName: 'Départementale 2',
      rank: 2,
      playersPerGame: 4,
      isArchived: false,
    },
  ]
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
})

afterEach(() => {
  openURL.mockRestore()
})

describe('Fiche équipe — groupe WhatsApp', () => {
  it('offers the group as an icon, with no section of its own', () => {
    render(<TeamDetailScreen />)

    expect(screen.getByLabelText('Groupe WhatsApp')).toBeTruthy()
    // The section and its full-width button are what the icon replaced.
    expect(screen.queryByText('WhatsApp')).toBeNull()
    expect(screen.queryByText('Rejoindre le groupe')).toBeNull()
  })

  it('opens the group when the icon is pressed', () => {
    render(<TeamDetailScreen />)

    fireEvent.press(screen.getByLabelText('Groupe WhatsApp'))

    expect(openURL).toHaveBeenCalledWith('https://chat.whatsapp.com/xyz')
  })

  it('shows no icon when the team has no group', () => {
    mockData.teams = [{ ...team, whatsappLink: undefined }]

    render(<TeamDetailScreen />)

    expect(screen.queryByLabelText('Groupe WhatsApp')).toBeNull()
  })

  it('leaves a member without any way to edit the link', () => {
    render(<TeamDetailScreen />)

    expect(screen.queryByText("Modifier l'équipe")).toBeNull()
  })

  it('lets the captain set the link from the team edit modal', () => {
    mockAuth.user = asUser(captain)
    mockData.teams = [{ ...team, whatsappLink: undefined }]

    render(<TeamDetailScreen />)
    fireEvent.press(screen.getByText("Modifier l'équipe"))
    fireEvent.changeText(
      screen.getByPlaceholderText('https://chat.whatsapp.com/...'),
      '  https://chat.whatsapp.com/new  ',
    )
    fireEvent.press(screen.getByText('Enregistrer'))

    expect(updateTeam).toHaveBeenCalledWith('t1', {
      playerIds: ['p1', 'p2'],
      captainId: 'p1',
      whatsappLink: 'https://chat.whatsapp.com/new',
    })
  })

  it('clears the link when the captain empties the field', () => {
    mockAuth.user = asUser(captain)

    render(<TeamDetailScreen />)
    fireEvent.press(screen.getByText("Modifier l'équipe"))
    fireEvent.changeText(screen.getByPlaceholderText('https://chat.whatsapp.com/...'), '')
    fireEvent.press(screen.getByText('Enregistrer'))

    expect(updateTeam).toHaveBeenCalledWith('t1', {
      playerIds: ['p1', 'p2'],
      captainId: 'p1',
      whatsappLink: null,
    })
  })

  it('seeds the field with the link already on the team', () => {
    mockAuth.user = asUser(captain)

    render(<TeamDetailScreen />)
    fireEvent.press(screen.getByText("Modifier l'équipe"))

    expect(screen.getByDisplayValue('https://chat.whatsapp.com/xyz')).toBeTruthy()
  })
})
