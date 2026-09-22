import { screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Game, GameSelection, MatchDay, Phase, Player, Season, Team } from '@shared/types'
import { PlayerDetail } from '@/components/PlayerDetail'

// ---------------------------------------------------------------------------
// Le brûlage sur la fiche joueur (#520)
//
// La règle s'affichait dans l'aperçu rapide et dans la matrice des journées,
// mais pas sur la fiche — l'écran qu'on ouvre justement pour demander « est-ce
// que je peux l'aligner ? ». Une règle qui change de réponse selon l'écran
// ouvert est pire qu'une règle absente d'un écran.
//
// `computeBrulage` reste la seule dérivation ; ce test vérifie que la fiche la
// pose, pas qu'elle la recalcule.
// ---------------------------------------------------------------------------
const mockData: Record<string, unknown> = {}
// #600 : la fiche lit la session pour décider qui peut écrire les coordonnées.
const mockAuth = { user: { id: 'u1', role: 'player', isPlayer: true, clubId: 'c1' } }

jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))

const club: Club = {
  id: 'c1', affiliationNumber: '09990001', displayName: 'Club Démo',
  isArchived: false, addresses: [], channels: [],
}
const phase: Phase = {
  id: 'ph1', seasonId: 's1', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active',
}
const season: Season = { id: 's1', displayName: '2026/2027', status: 'active' }
const player: Player = {
  id: 'p1', firstName: 'Camille', lastName: 'Durand', licenseNumber: '99990002',
  phone: '', status: 'active', clubId: 'c1',
}
// Cast through `unknown`: only the fields brûlage reads are stated, and a
// full Team here would be twenty lines of noise per team.
const team = (id: string, number: number, playerIds: string[]) =>
  ({ id, clubId: 'c1', phaseId: 'ph1', number, playerIds } as unknown as Team)
const team1 = team('t1', 1, ['p1'])
const team2 = team('t2', 2, [])

const matchDays: MatchDay[] = [
  { id: 'md1', phaseId: 'ph1', groupId: 'g', number: 1, date: '2026-09-05' } as unknown as MatchDay,
  { id: 'md2', phaseId: 'ph1', groupId: 'g', number: 2, date: '2026-09-19' } as unknown as MatchDay,
]
const games: Game[] = [
  { id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 'x' } as unknown as Game,
  { id: 'g2', matchDayId: 'md2', homeTeamId: 't1', awayTeamId: 'y' } as unknown as Game,
]

function base() {
  return {
    players: [player], clubs: [club], teams: [team1, team2], phases: [phase], seasons: [season],
    playerPhasePoints: [], playerSeasonCategories: [], playerSeasonLicences: [],
    matchDays, games, gameSelections: [] as GameSelection[],
  }
}

beforeEach(() => {
  Object.keys(mockData).forEach((k) => delete mockData[k])
  Object.assign(mockData, base())
})

describe('la fiche joueur — brûlage', () => {
  it('ne dit rien pour une seule sélection', () => {
    // Un match dans une équipe ne brûle personne : c'est exactement le seuil.
    mockData.gameSelections = [{ gameId: 'g1', teamId: 't1', playerIds: ['p1'] }]

    render(<PlayerDetail playerId="p1" />)

    expect(screen.queryByText('Brûlage')).toBeNull()
  })

  it("nomme l'équipe dans laquelle deux sélections brûlent", () => {
    mockData.gameSelections = [
      { gameId: 'g1', teamId: 't1', playerIds: ['p1'] },
      { gameId: 'g2', teamId: 't1', playerIds: ['p1'] },
    ]

    render(<PlayerDetail playerId="p1" />)

    expect(screen.getByText('Brûlage')).toBeTruthy()
  })

  it('se rend sans matchs ni sélections — un cache antérieur (#498)', () => {
    // `withDefaults` remplit ces tables pour un cache écrit avant qu'elles
    // n'existent ; la fiche doit se taire, pas refuser de s'afficher.
    mockData.matchDays = undefined
    mockData.games = undefined
    mockData.gameSelections = undefined

    render(<PlayerDetail playerId="p1" />)

    expect(screen.getByText('99990002')).toBeTruthy()
    expect(screen.queryByText('Brûlage')).toBeNull()
  })
})
