import { Alert, Linking } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { resetParams, setParams, useParams } from '@/__tests__/support/routeParams'
import { PHONE_WIDTH, resetWindowSize, setWindowSize } from '@/__tests__/support/window'
import type { Club, MemberGroup, User } from '@shared/types'
import ClubScreen from '@/app/(tabs)/club'

// ---------------------------------------------------------------------------
// Mon club (#365) — the screen the mobile app was missing entirely. It reads
// the club out of the data payload, so the two contexts are stubbed here and
// the screen is what gets exercised.
//
// Under __tests__/ rather than beside the screen: expo-router routes every
// file under app/, and a test there is bundled into the app.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null } = { user: null }
const mockData: Record<string, unknown> & {
  clubs: Club[]
  users: User[]
  memberGroups: MemberGroup[]
} = {
  clubs: [],
  users: [],
  memberGroups: [],
  // What the Compétitions section reads (#604) — nothing unless a test says so.
  competitions: [],
  competitionGroups: [],
  players: [],
  teams: [],
  divisions: [],
  gameSelections: [],
  seasons: [],
  playerSeasonCategories: [],
  refreshing: false,
  refresh: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
const mockPush = jest.fn()
// The section a tablet shows sits in the route (#604); the round trip matters
// there, so the params come from the shared store.
const mockSetParams = setParams
const mockUseParams = useParams
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockUseParams(),
}))

const member: User = {
  id: 'u1',
  role: 'player',
  isPlayer: true,
  firstName: 'Bo',
  lastName: 'Martin',
  clubId: 'c1',
}

const club: Club = {
  id: 'c1',
  affiliationNumber: '06680123',
  displayName: 'Rixheim PPA',
  isArchived: false,
  addresses: [
    {
      id: 'a1',
      label: 'Salle des sports',
      street: '12 rue du Stade',
      postalCode: '68170',
      city: 'Rixheim',
      isDefault: true,
    },
    {
      id: 'a2',
      label: 'Siège',
      street: '1 place de la Mairie',
      postalCode: '68170',
      city: 'Rixheim',
      isDefault: false,
    },
  ],
  channels: [
    { id: 'ch2', type: 'whatsapp', link: 'https://chat.whatsapp.com/xyz', sortOrder: 2 },
    { id: 'ch1', type: 'website', link: 'https://rixheim-ppa.fr', displayName: 'Notre site', sortOrder: 1 },
  ],
}

let openURL: jest.SpiedFunction<typeof Linking.openURL>

beforeEach(() => {
  // A phone: the sections stack. The tablet's rail has its own tests.
  setWindowSize(PHONE_WIDTH)
  resetParams()
  mockAuth.user = member
  mockData.clubs = [club]
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
})

afterEach(() => {
  resetWindowSize()
  openURL.mockRestore()
})

describe('Mon club', () => {
  it('shows the club identity', () => {
    render(<ClubScreen />)

    expect(screen.getByText('Rixheim PPA')).toBeTruthy()
    expect(screen.getByText('N° 06680123')).toBeTruthy()
  })

  it('lists the addresses, flagging the default one', () => {
    render(<ClubScreen />)

    expect(screen.getByText('Salle des sports')).toBeTruthy()
    expect(screen.getByText('12 rue du Stade, 68170 Rixheim')).toBeTruthy()
    expect(screen.getByText('Siège')).toBeTruthy()
    // One badge only — the second address is not the default.
    expect(screen.getAllByText('Par défaut')).toHaveLength(1)
  })

  it('opens an address in the maps app', () => {
    render(<ClubScreen />)

    fireEvent.press(screen.getByText('Salle des sports'))

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL.mock.calls[0][0]).toContain(
      encodeURIComponent('12 rue du Stade, 68170 Rixheim'),
    )
  })

  it('lists the channels in the club’s own order, labelled', () => {
    render(<ClubScreen />)

    // sortOrder decides, not payload order: the website (1) precedes WhatsApp (2).
    const labels = screen.getAllByText(/Notre site|WhatsApp/).map((n) => n.props.children)
    expect(labels).toEqual(['Notre site', 'WhatsApp'])
  })

  // A channel leaves the app — WhatsApp, a website — so it asks first (#604),
  // with the address, and opens only on « Ouvrir ».
  it('asks before opening a channel link, then opens it', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    render(<ClubScreen />)

    fireEvent.press(screen.getByText('Notre site'))
    expect(openURL).not.toHaveBeenCalled()
    const [title, message, buttons] = alert.mock.calls[0]
    expect(title).toBe('Notre site')
    expect(message).toContain('https://rixheim-ppa.fr')
    buttons?.find((b) => b.text === 'Ouvrir')?.onPress?.()
    expect(openURL).toHaveBeenCalledWith('https://rixheim-ppa.fr')
    alert.mockRestore()
  })

  it('says so when the club has neither address nor channel', () => {
    mockData.clubs = [{ ...club, addresses: [], channels: [] }]

    render(<ClubScreen />)

    expect(screen.getByText('Aucune adresse.')).toBeTruthy()
    expect(screen.getByText('Aucun canal.')).toBeTruthy()
  })

  it('degrades to a message when the club is not in the payload yet', () => {
    mockData.clubs = []

    render(<ClubScreen />)

    expect(screen.getByText('Club introuvable.')).toBeTruthy()
  })

  it('degrades to a message for a member with no club', () => {
    mockAuth.user = { ...member, clubId: undefined }

    render(<ClubScreen />)

    // The tab is hidden in this case; the screen must not blow up if reached.
    expect(screen.getByText('Club introuvable.')).toBeTruthy()
  })
})
