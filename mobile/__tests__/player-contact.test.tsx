import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { render } from '@/__tests__/support/render'
import type { Club, Phase, Player, Season } from '@shared/types'
import { PlayerDetail } from '@/components/PlayerDetail'

// ---------------------------------------------------------------------------
// Les coordonnées d'un licencié (#503)
//
// The email was inert text and the number only ever opened WhatsApp. Both are
// copiable now — and the WhatsApp tap, the gesture the club already has, is
// asserted here precisely because adding the second affordance must not have
// moved the first.
// ---------------------------------------------------------------------------
const mockData: {
  players: Player[]
  clubs: Club[]
  teams: never[]
  phases: Phase[]
  seasons: Season[]
  playerPhasePoints: never[]
  playerSeasonCategories: never[]
  playerSeasonLicences: never[]
} = {
  players: [], clubs: [], teams: [], phases: [], seasons: [],
  playerPhasePoints: [], playerSeasonCategories: [], playerSeasonLicences: [],
}

jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}

const player: Player = {
  id: 'p1', firstName: 'Joris', lastName: 'Szulc', licenseNumber: '686956',
  email: 'joris@example.com', phone: '06 12 34 56 78',
  status: 'active', clubId: 'c1',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockData.players = [player]
  mockData.clubs = [club]
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
})

describe('la fiche joueur — coordonnées', () => {
  it("copie l'email", async () => {
    render(<PlayerDetail playerId="p1" />)

    fireEvent.press(screen.getByTestId('copy-email'))

    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('joris@example.com'),
    )
  })

  it('copie le numéro tel qu’il est affiché, pas la version wa.me', async () => {
    render(<PlayerDetail playerId="p1" />)

    fireEvent.press(screen.getByTestId('copy-phone'))

    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('06 12 34 56 78'),
    )
  })

  it('confirme la copie sur la ligne concernée, et sur elle seule', async () => {
    render(<PlayerDetail playerId="p1" />)

    expect(screen.getByText('Email')).toBeTruthy()

    fireEvent.press(screen.getByTestId('copy-email'))

    // The label carries the confirmation; the value stays readable.
    await waitFor(() => expect(screen.getByText('Copié')).toBeTruthy())
    expect(screen.queryByText('Email')).toBeNull()
    expect(screen.getByText('Téléphone')).toBeTruthy()
    expect(screen.getByText('joris@example.com')).toBeTruthy()
  })

  it('ouvre toujours WhatsApp au tap sur le numéro', () => {
    render(<PlayerDetail playerId="p1" />)

    fireEvent.press(screen.getByText('06 12 34 56 78'))

    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/0612345678')
  })

  it('garde le + international du numéro pour wa.me', () => {
    mockData.players = [{ ...player, phone: '+33 6 12 34 56 78' }]
    render(<PlayerDetail playerId="p1" />)

    fireEvent.press(screen.getByText('+33 6 12 34 56 78'))

    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/33612345678')
  })
})
