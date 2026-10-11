import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { render } from '@/__tests__/support/render'
import type { PlayerImportWrites } from '@shared/lib/ffttPlayers'
import type { Club, Federation, Phase, Player, Season, User } from '@shared/types'
import { AGR_PLAYER_LIST } from '@shared/lib/__fixtures__/agrPlayerList'
import ImportPlayersScreen from '@/app/(tabs)/joueurs/import'

// ---------------------------------------------------------------------------
// La liste des joueurs AGR, dans l'app (#681)
//
// Le web lit le PDF dans le navigateur (#648) ; l'app ne le peut pas — Hermes
// ne fait pas tourner pdf.js —, donc le fichier choisi part à l'API, qui
// rend ses lignes. Ici : que l'écran les passe au même analyseur et à la même
// revue, avec la fédération — licence AGR, classement sur la phase AGR —, et
// qu'il refuse la liste d'un autre club.
// ---------------------------------------------------------------------------
const applyPlayerImport = jest.fn<Promise<void>, [PlayerImportWrites]>(async () => {})
const landser: Club = {
  id: 'landser', affiliationNumber: '', displayName: 'Landser ASL', isArchived: false, addresses: [], channels: [],
  affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }],
}
const admin = { id: 'lou', firstName: 'Lou', lastName: 'Admin', role: 'club_admin', clubId: 'landser', isPlayer: false } as User
const lucas = {
  id: 'lucas', firstName: 'Lucas', lastName: 'Martin', licenseNumber: '', phone: '', status: 'active', clubId: 'landser',
  licences: [{ federationId: 'agr', number: '1251100' }],
} as Player
const mockData = {
  clubs: [landser],
  phases: [{ id: 'phase-agr-27-1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active', federationId: 'agr' }] as Phase[],
  seasons: [{ id: '27', displayName: '2026/2027', status: 'active' }] as Season[],
  federations: [{ id: 'agr', shortName: 'AGR', displayName: 'AGR', isImported: false }] as Federation[],
  players: [lucas],
  users: [{ ...lucas, role: 'player', isPlayer: true }] as User[],
  playerPhasePoints: [] as never[],
  playerSeasonCategories: [] as never[],
  applyPlayerImport,
  setClubSeasonLicences: jest.fn(async () => {}),
}
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: admin }) }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({ federation: 'agr' }) }))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///liste.pdf', name: 'liste.pdf', mimeType: 'application/pdf' }] })),
}))
const mockRead = jest.fn()
jest.mock('@/utils/api', () => ({ readPdfLines: (...a: unknown[]) => mockRead(...a) }))

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}) })

describe('Import of an AGR list (#681)', () => {
  it('reads the picked PDF through the API and reviews it with the federation', async () => {
    mockRead.mockResolvedValue({ ok: true, lines: AGR_PLAYER_LIST })
    render(<ImportPlayersScreen />)
    expect(screen.getByText(/Classement sur 2026\/2027 Phase 1/)).toBeTruthy()
    fireEvent.press(screen.getByTestId('import-pick-pdf'))
    await waitFor(() => expect(mockRead).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///liste.pdf' })))
    // No FFTT look-up by licence on a PDF list.
    expect(await screen.findByText(/Landser ASL · n° 680036/)).toBeTruthy()
    expect(screen.queryByTestId('import-licence-input')).toBeNull()
    expect(screen.getByText(/Classement enregistré sur 2026\/2027 Phase 1/)).toBeTruthy()

    fireEvent.press(screen.getByTestId('import-apply'))
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as Array<{ text: string; onPress?: () => void }>
    buttons.find((b) => b.text === 'Importer')!.onPress!()
    await waitFor(() => expect(applyPlayerImport).toHaveBeenCalled())
    const writes = applyPlayerImport.mock.calls[0][0]
    // Five new licensees, each with their AGR licence; Lucas, found on his, gains a classement.
    expect(writes.creates).toHaveLength(5)
    expect(writes.creates.every((c) => c.licences?.[0]?.federationId === 'agr' && !c.licenseNumber)).toBe(true)
    expect(writes.points.every((p) => p.phaseId === 'phase-agr-27-1')).toBe(true)
    expect(writes.points.some((p) => p.playerId === 'lucas')).toBe(true)
  })

  it('refuses another club’s list, and says so under the button', async () => {
    mockRead.mockResolvedValue({ ok: true, lines: AGR_PLAYER_LIST.map((l) => (l === '( 680036 )' ? '( 680021 )' : l)) })
    render(<ImportPlayersScreen />)
    fireEvent.press(screen.getByTestId('import-pick-pdf'))
    expect(await screen.findByTestId('import-pick-message')).toHaveTextContent(/Cette liste est celle de LANDSER ASL \(n° 680021\)/)
  })

  it('shows what the API could not read', async () => {
    mockRead.mockResolvedValue({ ok: false, message: 'Impossible de lire ce fichier.' })
    render(<ImportPlayersScreen />)
    fireEvent.press(screen.getByTestId('import-pick-pdf'))
    expect(await screen.findByTestId('import-pick-message')).toHaveTextContent('Impossible de lire ce fichier.')
  })
})
