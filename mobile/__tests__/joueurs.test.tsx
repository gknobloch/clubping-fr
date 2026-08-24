import { fireEvent, render, screen } from '@testing-library/react-native'
import type { Club, Player, Role, User } from '@shared/types'
import JoueursScreen from '@/app/(tabs)/joueurs'

// ---------------------------------------------------------------------------
// Joueurs — the club directory (#438). The tab listed everyone the payload
// carried, archived members included, with no way to narrow it. An archived
// member has left the club: they are only of interest to the people who
// administer it, and even for them the list opens on the active roster.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null } = { user: null }
const mockData: { players: Player[]; clubs: Club[] } = { players: [], clubs: [] }

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}

const active: Player = {
  id: 'p1', firstName: 'Joris', lastName: 'Szulc', licenseNumber: '686956',
  phone: '0600000000', status: 'active', clubId: 'c1',
}
const archived: Player = {
  id: 'p2', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '681234',
  phone: '0611111111', status: 'archived', clubId: 'c1',
}

const signIn = (role: Role) => {
  mockAuth.user = { id: 'u1', role, isPlayer: role === 'player', clubId: 'c1' }
}

const LABEL = 'Joueurs actifs uniquement'

beforeEach(() => {
  mockData.players = [active, archived]
  mockData.clubs = [club]
})

describe('Joueurs — joueurs actifs uniquement (#438)', () => {
  it('opens on the active roster for a member, with no way to widen it', () => {
    signIn('player')
    render(<JoueursScreen />)

    expect(screen.getByText('Joris Szulc')).toBeTruthy()
    expect(screen.queryByText('Ancien Membre')).toBeNull()
    expect(screen.queryByLabelText(LABEL)).toBeNull()
  })

  it('gives a club admin the switch, on by default', () => {
    signIn('club_admin')
    render(<JoueursScreen />)

    expect(screen.getByLabelText(LABEL).props.value).toBe(true)
    expect(screen.queryByText('Ancien Membre')).toBeNull()
  })

  it('brings the archived ones in, badged, when the switch goes off', () => {
    signIn('club_admin')
    render(<JoueursScreen />)

    fireEvent(screen.getByLabelText(LABEL), 'valueChange', false)

    expect(screen.getByText('Ancien Membre')).toBeTruthy()
    expect(screen.getByText('Archivé')).toBeTruthy()
  })

  // The badge used to sit on every card, green and saying «Actif» — nothing,
  // repeated once per row. It is now the exception marker it reads as.
  it('badges nothing on the active roster', () => {
    signIn('club_admin')
    render(<JoueursScreen />)

    expect(screen.queryByText('Actif')).toBeNull()
  })
})
