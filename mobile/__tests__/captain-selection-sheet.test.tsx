import { fireEvent, render, screen } from '@testing-library/react-native'
import type {
  Club, Competition, CompetitionEligibility, Division, MatchDay, Player,
  PlayerSeasonCategory, Team,
} from '@shared/types'
import { CaptainSelectionSheet } from '@/components/CaptainSelectionSheet'

// ---------------------------------------------------------------------------
// Feuille de sélection — #454. Two things this app got wrong: it offered
// archived players (someone who has left the club) for a line-up, where the
// web has always filtered them out; and past a dozen licenciés "Autres
// joueurs" was a scroll with no way to search.
// ---------------------------------------------------------------------------

const club: Club = {
  id: 'c1',
  affiliationNumber: '06680123',
  displayName: 'Rixheim PPA',
  isArchived: false,
  addresses: [],
  channels: [],
}

const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 5,
  divisionId: 'd1', groupId: 'g1', gameLocationId: 'a1',
  defaultDay: 'Jeudi', defaultTime: '19:30', captainId: 'p1',
  isArchived: false, playerIds: ['p1', 'p2'],
}

const matchDay: MatchDay = { id: 'md1', groupId: 'g1', number: 1, date: '2026-09-12' }

function player(id: string, firstName: string, lastName: string, status: 'active' | 'archived' = 'active'): Player {
  return {
    id, firstName, lastName, licenseNumber: `L-${id}`, email: `${id}@example.com`,
    phone: '', status, clubId: 'c1',
  }
}

const roster = [player('p1', 'Gilles', 'Knobloch'), player('p2', 'David', 'Schmitt')]

/** Ten club players outside the roster — enough to cross the filter threshold. */
const others = [
  player('o1', 'Nicolas', 'Broglin'),
  player('o2', 'Frédéric', 'Zilbermann'),
  player('o3', 'Pascal', 'Afflard'),
  player('o4', 'Ryan', 'Alves'),
  player('o5', 'Jacky', 'Antony'),
  player('o6', 'Quentin', 'Broglin'),
  player('o7', 'Samuel', 'Carnemolla'),
  player('o8', 'Patrick', 'Cartagena'),
  player('o9', 'Eric', 'Cavasino'),
  player('o10', 'Abdelaziz', 'Arif'),
]

/** What the team's competition admits (#498); empty means nothing restricted. */
type Eligibility = {
  divisions?: Division[]
  competitions?: Competition[]
  competitionEligibilities?: CompetitionEligibility[]
  playerSeasonCategories?: PlayerSeasonCategory[]
  seasonId?: string
}

function renderSheet({
  teamPlayers = roster,
  clubPlayers = others,
  initialSelection = [] as string[],
  onSave = jest.fn(),
  eligibility = {} as Eligibility,
} = {}) {
  render(
    <CaptainSelectionSheet
      team={team}
      teamPlayers={teamPlayers}
      clubs={[club]}
      playersPerGame={4}
      getAvailability={() => undefined}
      initialSelection={initialSelection}
      selectionData={{
        matchDayId: matchDay.id,
        allClubPlayers: [...teamPlayers, ...clubPlayers],
        clubTeams: [team],
        matchDays: [matchDay],
        games: [],
        gameSelections: [],
        ...eligibility,
      }}
      onSave={onSave}
      onClose={jest.fn()}
    />,
  )
  return { onSave }
}

describe('Feuille de sélection — joueurs archivés (#454)', () => {
  it("ne propose pas un joueur archivé du club", () => {
    renderSheet({ clubPlayers: [...others, player('ox', 'Yannick', 'Schill', 'archived')] })

    expect(screen.getByText('Nicolas Broglin')).toBeTruthy()
    expect(screen.queryByText('Yannick Schill')).toBeNull()
  })

  it("ne propose pas un joueur archivé resté sur la feuille d'équipe", () => {
    renderSheet({ teamPlayers: [...roster, player('p3', 'Sébastien', 'Rentz', 'archived')] })

    expect(screen.getByText('Gilles Knobloch')).toBeTruthy()
    expect(screen.queryByText('Sébastien Rentz')).toBeNull()
  })

  it("garde un archivé déjà retenu, pour pouvoir le retirer", () => {
    renderSheet({
      clubPlayers: [...others, player('ox', 'Yannick', 'Schill', 'archived')],
      initialSelection: ['ox'],
    })

    expect(screen.getByText('Yannick Schill')).toBeTruthy()
  })
})

describe('Feuille de sélection — filtrer par nom (#454)', () => {
  it("n'offre pas de recherche sur une liste courte", () => {
    renderSheet({ clubPlayers: others.slice(0, 2) })

    expect(screen.queryByPlaceholderText('Rechercher un joueur')).toBeNull()
  })

  it('offre la recherche au-delà de dix noms', () => {
    renderSheet()

    expect(screen.getByPlaceholderText('Rechercher un joueur')).toBeTruthy()
  })

  it('filtre les deux sections, accents et casse indifférents', () => {
    renderSheet()

    fireEvent.changeText(screen.getByPlaceholderText('Rechercher un joueur'), 'frederic')

    expect(screen.getByText('Frédéric Zilbermann')).toBeTruthy()
    expect(screen.queryByText('Nicolas Broglin')).toBeNull()
    expect(screen.queryByText('Gilles Knobloch')).toBeNull()
  })

  it('laisse retenir le joueur trouvé', () => {
    const { onSave } = renderSheet()

    fireEvent.changeText(screen.getByPlaceholderText('Rechercher un joueur'), 'zilbermann')
    fireEvent.press(screen.getByText('Frédéric Zilbermann'))
    fireEvent.press(screen.getByText('Enregistrer'))

    expect(onSave).toHaveBeenCalledWith(['o2'])
  })

  it('le dit quand rien ne correspond', () => {
    renderSheet()

    fireEvent.changeText(screen.getByPlaceholderText('Rechercher un joueur'), 'zzz')

    expect(screen.getByText(/Aucun joueur ne correspond/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// L'éligibilité aux compétitions (#498)
//
// The sheet is one of the four ways a club fields somebody, and it now asks the
// same question as the other three.
// ---------------------------------------------------------------------------
describe('Feuille de sélection — l’éligibilité aux compétitions (#498)', () => {
  const division: Division = {
    id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5,
    playersPerGame: 4, isArchived: false, competitionId: 'comp1',
  }
  const competition: Competition = {
    id: 'comp1', displayName: 'Championnat par équipes',
    categories: [], isCategoryLocked: false, sortOrder: 1, isArchived: false,
  }
  const base = { divisions: [division], competitions: [competition] }

  const excluded = (playerId: string): CompetitionEligibility => ({
    clubId: 'c1', competitionId: 'comp1', playerId, effect: 'excluded',
  })

  it('n’offre pas un licencié que le club a exclu de la compétition', () => {
    renderSheet({ eligibility: { ...base, competitionEligibilities: [excluded('o3')] } })

    expect(screen.queryByText('Pascal Afflard')).toBeNull()
    expect(screen.getByText('Ryan Alves')).toBeTruthy()
  })

  it('le garde quand la composition ouverte le nomme déjà', () => {
    // The exclusion came after the line-up, and this sheet is where a captain
    // would take him back out: hiding the row would strand him on it.
    renderSheet({
      initialSelection: ['o3'],
      eligibility: { ...base, competitionEligibilities: [excluded('o3')] },
    })

    expect(screen.getByText('Pascal Afflard')).toBeTruthy()
  })

  it('lit la catégorie sur la saison, pas sur le licencié', () => {
    // A competition that names its categories admits the licensees who hold
    // one. Read off the player instead of the season, everyone would be «sans
    // catégorie» and the section would come back empty.
    renderSheet({
      eligibility: {
        ...base,
        competitions: [{ ...competition, categories: ['S'] }],
        playerSeasonCategories: [{ seasonId: 's1', playerId: 'o4', category: 'S' }],
        seasonId: 's1',
      },
    })

    expect(screen.getByText('Ryan Alves')).toBeTruthy()
    // Nobody else has a category on file for the season.
    expect(screen.queryByText('Pascal Afflard')).toBeNull()
  })

  it('ne restreint personne quand la division n’a pas de compétition', () => {
    renderSheet({ eligibility: { divisions: [{ ...division, competitionId: undefined }] } })

    expect(screen.getByText('Pascal Afflard')).toBeTruthy()
  })
})
