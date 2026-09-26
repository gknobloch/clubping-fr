import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import type {
  Competition, CompetitionGroup, Division, GameSelection, MemberGroup, Player,
  PlayerSeasonCategory, Team,
} from '@/types'
import { ClubCompetitions } from './ClubCompetitions'

// Each name links to the player behind it, so the tree needs a router.
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

// #604 — the club's half of the feature: each competition reserved, or not, to
// one of the club's groups. The rule lives in src/lib/competitionEligibility.spec.ts
// and the write in the API's suite; here, that the screen lists what the rule
// says, greys what it should, and asks before leaving a fielded player out.

const CLUB = 'club-1'
const SEASON = '26'

const data = vi.hoisted(() => ({
  setCompetitionGroup: vi.fn(),
  competitions: [] as Competition[],
  players: [] as Player[],
  memberGroups: [] as MemberGroup[],
  competitionGroups: [] as CompetitionGroup[],
  teams: [] as Team[],
  divisions: [] as Division[],
  gameSelections: [] as GameSelection[],
  playerSeasonCategories: [] as PlayerSeasonCategory[],
}))
const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: false,
  useAuth: () => ({ user: auth.user, token: null, logout: vi.fn() }),
}))

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    ...data,
    // A category is stated per season (#482): the fixtures file theirs here.
    seasons: [{ id: SEASON, displayName: '2025/2026', status: 'active' }],
  }),
}))

const CATEGORIES: PlayerSeasonCategory[] = []
const player = (id: string, first: string, last: string, category?: string): Player => {
  if (category) CATEGORIES.push({ seasonId: SEASON, playerId: id, category })
  return {
    id, firstName: first, lastName: last, licenseNumber: '1', phone: '',
    status: 'active', clubId: CLUB,
  }
}

const youth: Competition = {
  id: 'comp-jeunes', displayName: 'Championnat jeunes',
  categories: ['B', 'M', 'C', 'J'], sortOrder: 1, isArchived: false,
}
const seniors: Competition = {
  id: 'comp-seniors', displayName: 'Championnat par équipes',
  categories: [], sortOrder: 2, isArchived: false,
}

const CADET = player('p-cadet', 'Samuel', 'Canemolla', 'C1')
const SENIOR = player('p-senior', 'Joris', 'Szulc', 'S')
const VETERAN = player('p-veteran', 'Hervé', 'Ceroni', 'V55')

const competitors: MemberGroup = {
  id: 'g-comp', clubId: CLUB, displayName: 'Compétiteurs', memberIds: ['p-cadet', 'p-senior'],
}

beforeEach(() => {
  data.setCompetitionGroup.mockReset()
  data.competitions = [youth, seniors]
  data.players = [CADET, SENIOR, VETERAN]
  data.memberGroups = [competitors]
  data.competitionGroups = []
  data.teams = []
  data.divisions = []
  data.gameSelections = []
  data.playerSeasonCategories = CATEGORIES
  auth.user = { id: 'ca', role: 'club_admin', isPlayer: false, clubId: CLUB }
})

/** One competition's card, by its name. */
const card = (name: string) => screen.getByText(name).closest('li')!

describe('ClubCompetitions — reserving a competition to a group (#604)', () => {
  it('lists who the categories admit when no group is set, and nothing greyed', () => {
    render(<ClubCompetitions clubId={CLUB} />)
    const jeunes = card('Championnat jeunes')
    expect(within(jeunes).getByText('1 joueur éligible')).toBeInTheDocument()
    expect(within(jeunes).getByRole('link', { name: 'Samuel Canemolla' })).toBeInTheDocument()
    expect(within(jeunes).getByRole('combobox')).toHaveValue('')
  })

  it('narrows a competition with no category to the group', () => {
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const card2 = card('Championnat par équipes')
    expect(within(card2).getByText('2 joueurs éligibles')).toBeInTheDocument()
    expect(within(card2).queryByText('Hervé Ceroni')).not.toBeInTheDocument()
  })

  // In the group, turned away by the categories: shown, greyed, and why.
  it('greys a group member the categories turn away', () => {
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-jeunes', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const jeunes = card('Championnat jeunes')
    expect(within(jeunes).getByText(/1 joueur éligible · 1 hors catégorie/)).toBeInTheDocument()
    const senior = within(jeunes).getByRole('link', { name: 'Joris Szulc' }).closest('li')!
    expect(senior).toHaveClass('text-slate-400')
    expect(senior).toHaveTextContent('Hors catégorie')
  })

  it('sets and lifts the group', async () => {
    const user = userEvent.setup()
    render(<ClubCompetitions clubId={CLUB} />)
    const select = within(card('Championnat par équipes')).getByRole('combobox')
    await user.selectOptions(select, 'g-comp')
    expect(data.setCompetitionGroup).toHaveBeenCalledWith(CLUB, 'comp-seniors', 'g-comp')

    await user.selectOptions(select, '')
    expect(data.setCompetitionGroup).toHaveBeenLastCalledWith(CLUB, 'comp-seniors', null)
  })

  describe('a player an équipe already fields', () => {
    beforeEach(() => {
      data.divisions = [{
        id: 'd-1', phaseId: 'ph', displayName: 'D1', rank: 1, playersPerGame: 4,
        isArchived: false, competitionId: 'comp-seniors',
      }]
      data.teams = [{
        id: 't-1', clubId: CLUB, phaseId: 'ph', number: 1, divisionId: 'd-1', groupId: 'grp',
        gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', isArchived: false,
        playerIds: ['p-veteran'],
      }]
    })

    // Nothing is taken off a team: the question says so, and names them.
    it('asks before reserving to a group that leaves them out, and writes nothing on « Annuler »', async () => {
      const user = userEvent.setup()
      render(<ClubCompetitions clubId={CLUB} />)
      await user.selectOptions(within(card('Championnat par équipes')).getByRole('combobox'), 'g-comp')

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Hervé Ceroni')
      expect(dialog).toHaveTextContent('Rien ne les retire')
      await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
      expect(data.setCompetitionGroup).not.toHaveBeenCalled()
    })

    it('flags them once the competition is reserved', () => {
      data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
      render(<ClubCompetitions clubId={CLUB} />)
      const alert = within(card('Championnat par équipes')).getByRole('alert')
      expect(alert).toHaveTextContent('Engagés mais plus éligibles')
      expect(alert).toHaveTextContent("Hervé Ceroni — Déjà dans l'équipe 1")
    })
  })

  it('shows a plain member the group, and no way to change it', () => {
    auth.user = { id: 'p-senior', role: 'player', isPlayer: true, clubId: CLUB }
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const card2 = card('Championnat par équipes')
    expect(within(card2).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(card2).getByText('Compétiteurs')).toBeInTheDocument()
  })

  it('points an admin whose club has no group to where groups are made', () => {
    data.memberGroups = []
    render(<ClubCompetitions clubId={CLUB} />)
    expect(screen.getByRole('link', { name: 'Créer des groupes' })).toHaveAttribute('href', '/club')
  })
})
