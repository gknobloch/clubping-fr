import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Phase, Player, Season, User } from '@shared/types'
import { PlayerDetail } from '@/components/PlayerDetail'

// ---------------------------------------------------------------------------
// Corriger les coordonnées d'un licencié (#600)
//
// L'app ne l'a jamais permis : la fiche joueur était en lecture seule, donc un
// administrateur de club qui relevait un numéro faux dans le gymnase devait
// rentrer ouvrir le site. Le serveur, lui, sait refuser depuis #558 — c'était
// une lacune d'écran, pas de règle.
//
// Ce qui est épinglé ici est donc *qui voit le déclencheur*, et ce que
// « Enregistrer » écrit : les deux moitiés que le reste de l'app ne dit pas.
// ---------------------------------------------------------------------------
const mockData: Record<string, unknown> = {}
const mockAuth: { user: User | null } = { user: null }

jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

const player: Player = {
  id: 'p1', firstName: 'Joris', lastName: 'Szulc', licenseNumber: '686956',
  email: 'joris@example.com', phone: '06 12 34 56 78',
  status: 'active', clubId: 'c1',
}

const member = (over: Partial<User>): User =>
  ({ id: 'u1', role: 'player', isPlayer: true, clubId: 'c1', ...over })

let updatePlayer: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  updatePlayer = jest.fn()
  Object.assign(mockData, {
    players: [player], clubs: [club], teams: [], phases: [phase], seasons: [season],
    playerPhasePoints: [], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    matchDays: [], games: [], gameSelections: [],
    updatePlayer,
  })
  mockAuth.user = member({ role: 'club_admin' })
})

describe('qui peut modifier les coordonnées', () => {
  it("offre « Modifier » à l'administrateur du club du licencié", () => {
    render(<PlayerDetail playerId="p1" />)

    expect(screen.getByTestId('edit-contact')).toBeTruthy()
  })

  it("l'offre à un administrateur général, qui administre partout", () => {
    mockAuth.user = member({ role: 'general_admin', clubId: undefined })

    render(<PlayerDetail playerId="p1" />)

    expect(screen.getByTestId('edit-contact')).toBeTruthy()
  })

  it("ne l'offre pas à un coéquipier", () => {
    mockAuth.user = member({ role: 'player' })

    render(<PlayerDetail playerId="p1" />)

    expect(screen.queryByTestId('edit-contact')).toBeNull()
    // …mais la fiche montre toujours ses coordonnées : la lecture n'a pas bougé.
    expect(screen.getByText('joris@example.com')).toBeTruthy()
  })

  it("ne l'offre pas à l'administrateur d'un autre club", () => {
    mockAuth.user = member({ role: 'club_admin', clubId: 'c2' })

    render(<PlayerDetail playerId="p1" />)

    expect(screen.queryByTestId('edit-contact')).toBeNull()
  })
})

describe('la section Coordonnées', () => {
  // Le cas qu'on vient réparer : une section conditionnée à la présence des
  // valeurs n'offrirait rien à celui qui n'en a aucune.
  it('reste ouverte à celui qui peut écrire, même sans aucune coordonnée', () => {
    mockData.players = [{ ...player, email: undefined, phone: '' }]

    render(<PlayerDetail playerId="p1" />)

    expect(screen.getByText('Aucune coordonnée enregistrée.')).toBeTruthy()
    expect(screen.getByTestId('edit-contact')).toBeTruthy()
  })

  it("ne dit rien à qui ne peut pas l'écrire", () => {
    mockData.players = [{ ...player, email: undefined, phone: '' }]
    mockAuth.user = member({ role: 'player' })

    render(<PlayerDetail playerId="p1" />)

    expect(screen.queryByText('Aucune coordonnée enregistrée.')).toBeNull()
  })
})

describe('ce que « Enregistrer » écrit', () => {
  it("n'envoie que le champ modifié", () => {
    render(<PlayerDetail playerId="p1" />)
    fireEvent.press(screen.getByTestId('edit-contact'))

    fireEvent.changeText(screen.getByTestId('contact-edit-phone'), '07 99 98 12 34')
    fireEvent.press(screen.getByTestId('contact-edit-save'))

    expect(updatePlayer).toHaveBeenCalledWith('p1', { phone: '07 99 98 12 34' })
  })

  it("vide un e-mail en chaîne vide, que l'API tourne en NULL", () => {
    render(<PlayerDetail playerId="p1" />)
    fireEvent.press(screen.getByTestId('edit-contact'))

    fireEvent.changeText(screen.getByTestId('contact-edit-email'), '')
    fireEvent.press(screen.getByTestId('contact-edit-save'))

    expect(updatePlayer).toHaveBeenCalledWith('p1', { email: '' })
  })

  it("n'écrit rien quand rien n'a bougé", () => {
    render(<PlayerDetail playerId="p1" />)
    fireEvent.press(screen.getByTestId('edit-contact'))

    fireEvent.press(screen.getByTestId('contact-edit-save'))

    expect(updatePlayer).not.toHaveBeenCalled()
  })

  it("n'écrit rien sur « Annuler », frappe comprise", () => {
    render(<PlayerDetail playerId="p1" />)
    fireEvent.press(screen.getByTestId('edit-contact'))

    fireEvent.changeText(screen.getByTestId('contact-edit-email'), 'autre@example.com')
    fireEvent.press(screen.getByTestId('contact-edit-cancel'))

    expect(updatePlayer).not.toHaveBeenCalled()
  })

  // Le formulaire est partagé avec « Mon compte », qui en montre quatre. Un
  // champ que la fiche ne montre pas est un champ qu'elle n'écrit pas.
  it("n'offre pas les champs que la fiche ne montre pas", () => {
    render(<PlayerDetail playerId="p1" />)
    fireEvent.press(screen.getByTestId('edit-contact'))

    expect(screen.getByTestId('contact-edit-email')).toBeTruthy()
    expect(screen.queryByTestId('contact-edit-birthDate')).toBeNull()
    expect(screen.queryByTestId('contact-edit-birthPlace')).toBeNull()
  })
})
