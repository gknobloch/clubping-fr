import { Alert } from 'react-native'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { DelegationsSection } from '@/components/DelegationsSection'
import type { Delegations } from '@shared/types'

// ---------------------------------------------------------------------------
// Délégations dans Mon compte (#655)
//
// Le web les a depuis la deuxième étape ; l'app non, alors que c'est sur le
// téléphone qu'un parent ouvre les matchs de son enfant. Épinglé : ce qui est
// lu, ce qu'« Ajouter » envoie, que les refus de l'API s'affichent tels quels,
// et que « Ne plus gérer » redemande les profils au serveur.
// ---------------------------------------------------------------------------
const mockAuth = { refreshProfiles: jest.fn(async () => {}) }
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))

const mockApi = {
  fetchDelegations: jest.fn<Promise<Delegations>, [string]>(),
  addDelegateByEmail: jest.fn(),
  removeDelegate: jest.fn(),
}
jest.mock('@/utils/api', () => ({
  fetchDelegations: (...a: [string]) => mockApi.fetchDelegations(...a),
  addDelegateByEmail: (...a: [string, string]) => mockApi.addDelegateByEmail(...a),
  removeDelegate: (...a: [string, string]) => mockApi.removeDelegate(...a),
}))

const benjamin = { id: 'person-benjamin', firstName: 'Benjamin', lastName: 'Henaut', email: 'henaut@example.fr' }
const sacha = { id: 'person-sacha', firstName: 'Sacha', lastName: 'Henaut' }

beforeEach(() => {
  jest.clearAllMocks()
  mockApi.fetchDelegations.mockResolvedValue({ delegates: [], represents: [] })
})

/** Presses the button of the last Alert with that label. */
async function answer(label: string) {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as Array<{ text: string; onPress?: () => unknown }>
  await buttons.find((b) => b.text === label)!.onPress?.()
}

describe('DelegationsSection', () => {
  beforeEach(() => { jest.spyOn(Alert, 'alert').mockImplementation(() => {}) })

  it('says nobody when nobody opens the profiles', async () => {
    render(<DelegationsSection personId="person-sacha" />)
    expect(await screen.findByText('Personne.')).toBeTruthy()
    expect(mockApi.fetchDelegations).toHaveBeenCalledWith('person-sacha')
  })

  it('names a delegate by address, and lists them once the API agreed', async () => {
    mockApi.addDelegateByEmail.mockResolvedValue({ ok: true })
    render(<DelegationsSection personId="person-sacha" />)
    fireEvent.press(await screen.findByTestId('delegate-add'))
    fireEvent.changeText(screen.getByTestId('delegate-email'), ' henaut@example.fr ')
    mockApi.fetchDelegations.mockResolvedValue({ delegates: [benjamin], represents: [] })
    fireEvent.press(screen.getByTestId('delegate-save'))
    expect(await screen.findByText('Benjamin Henaut')).toBeTruthy()
    expect(mockApi.addDelegateByEmail).toHaveBeenCalledWith('person-sacha', 'henaut@example.fr')
  })

  it("shows the API's refusal as written, and keeps the form open", async () => {
    mockApi.addDelegateByEmail.mockResolvedValue({ ok: false, message: "Aucun compte n'utilise cette adresse." })
    render(<DelegationsSection personId="person-sacha" />)
    fireEvent.press(await screen.findByTestId('delegate-add'))
    fireEvent.changeText(screen.getByTestId('delegate-email'), 'inconnu@example.fr')
    fireEvent.press(screen.getByTestId('delegate-save'))
    expect(await screen.findByText("Aucun compte n'utilise cette adresse.")).toBeTruthy()
    expect(screen.getByTestId('delegate-email')).toBeTruthy()
  })

  it('withdraws a delegate after asking', async () => {
    mockApi.fetchDelegations.mockResolvedValue({ delegates: [benjamin], represents: [] })
    mockApi.removeDelegate.mockResolvedValue(true)
    render(<DelegationsSection personId="person-sacha" />)
    fireEvent.press(await screen.findByTestId('delegate-remove-person-benjamin'))
    await answer('Retirer')
    expect(mockApi.removeDelegate).toHaveBeenCalledWith('person-sacha', 'person-benjamin')
  })

  it('steps down from a delegation, and asks the server again which profiles it opens', async () => {
    mockApi.fetchDelegations.mockResolvedValue({ delegates: [], represents: [sacha] })
    mockApi.removeDelegate.mockResolvedValue(true)
    render(<DelegationsSection personId="person-benjamin" />)
    fireEvent.press(await screen.findByTestId('delegate-stepdown-person-sacha'))
    await answer('Ne plus gérer')
    expect(mockApi.removeDelegate).toHaveBeenCalledWith('person-sacha', 'person-benjamin')
    await waitFor(() => expect(mockAuth.refreshProfiles).toHaveBeenCalled())
  })

  it('says so when the delegations cannot be read', async () => {
    mockApi.fetchDelegations.mockRejectedValue(new Error('offline'))
    render(<DelegationsSection personId="person-sacha" />)
    expect(await screen.findByText('Les délégations n’ont pas pu être lues.')).toBeTruthy()
  })
})
