import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { render } from '@/__tests__/support/render'
import type { PlayerImportWrites } from '@shared/lib/ffttPlayers'
import type { Club, Phase, Player, Role, User } from '@shared/types'
import ImportPlayersScreen from '@/app/(tabs)/joueurs/import'

// ---------------------------------------------------------------------------
// Importer les licenciés FFTT depuis l'app (#555)
//
// What is under test here is the screen: which licensees reach the deck, what
// a tick means, and what the button announces. What an import *writes* is
// `playerImportWrites`, tested with the rest of the rule in
// src/lib/ffttPlayers.spec.ts — this asserts that the screen hands that
// derivation the right review and never claims more than it wrote.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null } = { user: null }
const applyPlayerImport = jest.fn(async (_writes: PlayerImportWrites) => {})
const setClubSeasonLicences = jest.fn(async () => {})
const mockBack = jest.fn()

const mockData = {
  clubs: [] as Club[],
  phases: [] as Phase[],
  players: [] as Player[],
  playerPhasePoints: [] as never[],
  playerSeasonCategories: [] as never[],
  applyPlayerImport,
  setClubSeasonLicences,
}

// The deck is moved by a gesture, and a PanResponder's gestureState is built
// from a touch history no synthetic event carries — the same swap #552 makes
// on the match screen. What is under test is what the screen does with a
// swipe; that a swipe is one is `Pager.test.tsx`.
let mockSwipeHandler: ((direction: -1 | 1) => void) | null = null
jest.mock('@/components/Pager', () => ({
  ...jest.requireActual('@/components/Pager'),
  usePagerSwipe: (fn: (direction: -1 | 1) => void) => {
    mockSwipeHandler = fn
    return {}
  },
}))

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680011', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const phase: Phase = {
  id: 'ph1', seasonId: 's1', displayName: 'Phase 1', status: 'active',
} as Phase

/** One record of the real xml_licence_b.php?club=… answer. */
const record = (over: Partial<Record<string, string>> = {}) => {
  const f = {
    licence: '425881', nom: 'CANAQUE', prenom: 'Gregory',
    numclub: '06680011', nomclub: 'RIXHEIM PPA', point: '1731', cat: 'V40',
    ...over,
  }
  return `<licence><idlicence>1</idlicence><licence>${f.licence}</licence>`
    + `<nom>${f.nom}</nom><prenom>${f.prenom}</prenom><numclub>${f.numclub}</numclub>`
    + `<nomclub>${f.nomclub}</nomclub><point>${f.point}</point><cat>${f.cat}</cat></licence>`
}

const listing = (...records: string[]) => `<liste>${records.join('')}</liste>`

/** FFTT answering with this body, as `fetch` would from the app. */
const ffttAnswers = (xml: string) => {
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => xml })) as never
}

const signIn = (role: Role) => {
  mockAuth.user = { id: 'u1', role, isPlayer: false, clubId: 'c1' }
}

const held = (over: Partial<Player>): Player => ({
  id: 'p1', firstName: 'Gregory', lastName: 'Canaque', licenseNumber: '425881',
  phone: '', status: 'active', clubId: 'c1', ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSwipeHandler = null
  mockData.clubs = [club]
  mockData.phases = [phase]
  mockData.players = []
  mockData.playerPhasePoints = []
  mockData.playerSeasonCategories = []
  signIn('club_admin')
  ffttAnswers(listing(record()))
})

const openScreen = async () => {
  render(<ImportPlayersScreen />)
  await waitFor(() => expect(screen.getByTestId('import-summary')).toBeTruthy())
}

describe("l'accès à l'import", () => {
  it('is refused to a player, who administers nobody', async () => {
    signIn('player')
    render(<ImportPlayersScreen />)

    expect(screen.getByText(/administrateurs du club/)).toBeTruthy()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('says so when the club has no FFTT affiliation number to ask about', () => {
    mockData.clubs = [{ ...club, affiliationNumber: '' }]
    render(<ImportPlayersScreen />)

    expect(screen.getByText(/numéro d'affiliation/)).toBeTruthy()
  })

  it('offers a retry rather than an empty deck when FFTT is unreachable', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed')
    }) as never
    render(<ImportPlayersScreen />)

    await waitFor(() => expect(screen.getByTestId('import-retry')).toBeTruthy())
  })
})

describe('le deck', () => {
  it('holds only the licensees with something to write', async () => {
    // Already ours, name for name and point for point: nothing to decide.
    mockData.players = [held({})]
    mockData.playerPhasePoints = [
      { phaseId: 'ph1', playerId: 'p1', points: '1731' },
    ] as never
    mockData.playerSeasonCategories = [
      { seasonId: 's1', playerId: 'p1', category: 'V40' },
    ] as never
    ffttAnswers(listing(record(), record({ licence: '392885', nom: 'CLEMENT', prenom: 'Didier' })))
    render(<ImportPlayersScreen />)

    await waitFor(() => expect(screen.getByTestId('import-card-392885')).toBeTruthy())
    expect(screen.queryByTestId('import-card-425881')).toBeNull()
    // Seen, and said so — not silently dropped.
    expect(screen.getByText('1 licencié est déjà à jour.')).toBeTruthy()
  })

  it('drops a licence FFTT returned for another club', async () => {
    ffttAnswers(listing(record(), record({ licence: '999999', numclub: '06680099' })))
    await openScreen()

    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
    expect(screen.queryByTestId('import-card-999999')).toBeNull()
  })

  it('names who we hold that the FFTT listing does not mention', async () => {
    mockData.players = [held({ id: 'p9', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '111111' })]
    await openScreen()

    expect(screen.getByTestId('import-missing')).toBeTruthy()
    expect(screen.getByText(/Ancien Membre/)).toBeTruthy()
  })
})

describe('le carrousel', () => {
  const three = () => listing(
    record(),
    record({ licence: '392885', nom: 'CLEMENT', prenom: 'Didier' }),
    record({ licence: '684545', nom: 'CERONI', prenom: 'Herve' }),
  )

  it('shows one licensee at a time, with a dot each', async () => {
    ffttAnswers(three())
    await openScreen()

    expect(screen.getByTestId('import-dots').children).toHaveLength(3)
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
    expect(screen.queryByTestId('import-card-392885')).toBeNull()
  })

  it('moves to the next card on a swipe, and back on the other one', async () => {
    ffttAnswers(three())
    await openScreen()

    act(() => mockSwipeHandler?.(1))
    expect(screen.getByTestId('import-card-392885')).toBeTruthy()

    act(() => mockSwipeHandler?.(-1))
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
  })

  it('stops at each end rather than wrapping round', async () => {
    ffttAnswers(three())
    await openScreen()

    act(() => mockSwipeHandler?.(-1))
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()

    act(() => mockSwipeHandler?.(1))
    act(() => mockSwipeHandler?.(1))
    act(() => mockSwipeHandler?.(1))
    expect(screen.getByTestId('import-card-684545')).toBeTruthy()
  })

  it('keeps every card in the count, not just the one on screen', async () => {
    // The button answers for the whole deck: what is under the finger is one
    // card, what is being imported is all of them.
    ffttAnswers(three())
    await openScreen()

    expect(screen.getByTestId('import-summary')).toHaveTextContent('3 licenciés créés.')
  })
})

describe('la revue', () => {
  it('announces what the selection writes, counting a creation', async () => {
    await openScreen()

    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 licencié créé.')
  })

  it('drops a licensee out of the count when they are ignored', async () => {
    await openScreen()

    fireEvent.press(screen.getByTestId('import-ignore-425881'))

    expect(screen.getByTestId('import-summary')).toHaveTextContent('Rien de sélectionné.')
  })

  it('takes an ignored licensee back, whole', async () => {
    await openScreen()
    fireEvent.press(screen.getByTestId('import-ignore-425881'))

    fireEvent.press(screen.getByTestId('import-ignore-425881'))

    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 licencié créé.')
  })

  it('unticks one field without touching the rest of the card', async () => {
    mockData.players = [held({ lastName: 'Canac' })]
    await openScreen()

    fireEvent.press(screen.getByTestId('import-field-425881-lastName'))

    // Still an update — the points and the category are still ticked.
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 mis à jour.')
    fireEvent.press(screen.getByTestId('import-apply'))
    await waitFor(() => expect(applyPlayerImport).toHaveBeenCalled())
    expect(applyPlayerImport.mock.calls[0][0]).toMatchObject({ updates: [] })
  })
})

describe("l'import", () => {
  it('writes the selection and reports what landed', async () => {
    await openScreen()

    fireEvent.press(screen.getByTestId('import-apply'))

    await waitFor(() => expect(screen.getByTestId('import-done')).toBeTruthy())
    expect(screen.getByText('1 licencié créé.')).toBeTruthy()
    const writes = applyPlayerImport.mock.calls[0][0]
    expect(writes.creates).toHaveLength(1)
    expect(writes.creates[0]).toMatchObject({ licenseNumber: '425881', clubId: 'c1' })
    // Points on the phase, the category on its season (#482).
    expect(writes.points[0]).toMatchObject({ phaseId: 'ph1' })
    expect(writes.categories[0]).toMatchObject({ seasonId: 's1' })
  })

  it('claims nothing when the writes did not land, and keeps the review', async () => {
    applyPlayerImport.mockRejectedValueOnce(new Error('HTTP 500'))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await openScreen()

    fireEvent.press(screen.getByTestId('import-apply'))

    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(screen.queryByTestId('import-done')).toBeNull()
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 licencié créé.')
    alert.mockRestore()
  })

  it('records who the federation listed, for the season (#488)', async () => {
    mockData.players = [held({})]
    await openScreen()

    expect(setClubSeasonLicences).toHaveBeenCalledWith('c1', 's1', ['p1'])
  })
})
