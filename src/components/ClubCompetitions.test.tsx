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
  setMemberGroupMembers: vi.fn(),
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
const veterans: Competition = {
  id: 'comp-veterans', displayName: 'Championnat vétérans',
  categories: ['V50', 'V55'], sortOrder: 3, isArchived: false,
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

const division = (id: string, competitionId: string): Division => ({
  id, phaseId: 'ph', displayName: id, rank: 1, playersPerGame: 4, isArchived: false, competitionId,
})
const team = (id: string, number: number, divisionId: string, playerIds: string[]): Team => ({
  id, clubId: CLUB, phaseId: 'ph', number, divisionId, groupId: 'grp',
  gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', isArchived: false, playerIds,
})

beforeEach(() => {
  data.setCompetitionGroup.mockReset()
  data.setMemberGroupMembers.mockReset()
  data.competitions = [youth, seniors, veterans]
  data.players = [CADET, SENIOR, VETERAN]
  data.memberGroups = [competitors]
  data.competitionGroups = []
  // The club plays the youth and the senior championships, not the veterans'.
  data.divisions = [division('d-jeunes', 'comp-jeunes'), division('d-sen', 'comp-seniors')]
  data.teams = [team('t-1', 1, 'd-sen', ['p-veteran']), team('t-6', 6, 'd-jeunes', ['p-cadet'])]
  data.gameSelections = []
  data.playerSeasonCategories = CATEGORIES
  auth.user = { id: 'ca', role: 'club_admin', isPlayer: false, clubId: CLUB }
})

/** One competition's card, by its name. */
const card = (name: string) => screen.getByText(name).closest('li')!
/** The names the card's table lists. */
const listed = (el: HTMLElement) => within(el).getAllByRole('link').map((a) => a.textContent)

describe('ClubCompetitions — reserving a competition to a group (#604)', () => {
  it('lists only the competitions the club plays, and folds the rest', async () => {
    const user = userEvent.setup()
    render(<ClubCompetitions clubId={CLUB} />)
    expect(screen.queryByText('Championnat vétérans')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /compétitions où le club n'a pas d'équipe \(1\)/ }))
    expect(screen.getByText('Championnat vétérans')).toBeInTheDocument()
  })

  it('lists who the categories admit when no group is set, with nothing to tick', () => {
    render(<ClubCompetitions clubId={CLUB} />)
    const jeunes = card('Championnat jeunes')
    expect(within(jeunes).getByText('1 joueur éligible')).toBeInTheDocument()
    expect(listed(jeunes)).toEqual(['Samuel Canemolla'])
    expect(within(jeunes).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('narrows a competition with no category to the group, and says who is in it', () => {
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const sen = card('Championnat par équipes')
    expect(within(sen).getByText('2 joueurs éligibles')).toBeInTheDocument()
    // Everyone the categories admit is listed — the group is made from them.
    expect(listed(sen)).toEqual(['Samuel Canemolla', 'Hervé Ceroni', 'Joris Szulc'])
    expect(within(sen).getByRole('row', { name: /Hervé Ceroni/ })).toHaveTextContent('—')
  })

  it('greys a group member the categories turn away, and offers no box for them', () => {
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-jeunes', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const row = within(card('Championnat jeunes')).getByRole('row', { name: /Joris Szulc/ })
    expect(row).toHaveClass('text-slate-400')
    expect(row).toHaveTextContent('Hors catégorie')
    expect(within(row).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('sets and lifts the group', async () => {
    const user = userEvent.setup()
    data.teams = []
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const select = within(card('Championnat par équipes')).getByRole('combobox')
    await user.selectOptions(select, '')
    expect(data.setCompetitionGroup).toHaveBeenLastCalledWith(CLUB, 'comp-seniors', null)
    await user.selectOptions(select, 'g-comp')
    expect(data.setCompetitionGroup).toHaveBeenLastCalledWith(CLUB, 'comp-seniors', 'g-comp')
  })

  describe('the table files people into the group', () => {
    beforeEach(() => {
      data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
    })

    it('adds whoever is ticked, keeping who was there', async () => {
      const user = userEvent.setup()
      render(<ClubCompetitions clubId={CLUB} />)
      const sen = card('Championnat par équipes')
      await user.click(within(sen).getByRole('checkbox', { name: 'Sélectionner Hervé Ceroni' }))
      await user.click(within(sen).getByRole('button', { name: 'Ajouter au groupe (1)' }))
      expect(data.setMemberGroupMembers).toHaveBeenCalledWith(CLUB, 'g-comp', ['p-cadet', 'p-senior', 'p-veteran'])
    })

    it('selects everyone shown at once', async () => {
      const user = userEvent.setup()
      render(<ClubCompetitions clubId={CLUB} />)
      const sen = card('Championnat par équipes')
      await user.click(within(sen).getByRole('checkbox', { name: 'Tout sélectionner' }))
      expect(within(sen).getByRole('button', { name: 'Ajouter au groupe (1)' })).toBeEnabled()
      expect(within(sen).getByRole('button', { name: 'Retirer du groupe (2)' })).toBeEnabled()
    })

    // The case the table is for: fielded, outside the group — two clicks.
    it('selects the fielded players outside the group from the warning', async () => {
      const user = userEvent.setup()
      render(<ClubCompetitions clubId={CLUB} />)
      const sen = card('Championnat par équipes')
      const alert = within(sen).getByRole('alert')
      expect(alert).toHaveTextContent('1 joueur engagé mais plus éligible')
      await user.click(within(alert).getByRole('button', { name: 'Les sélectionner' }))
      expect(listed(sen)).toEqual(['Hervé Ceroni'])
      await user.click(within(sen).getByRole('button', { name: 'Ajouter au groupe (1)' }))
      expect(data.setMemberGroupMembers).toHaveBeenCalledWith(CLUB, 'g-comp', ['p-cadet', 'p-senior', 'p-veteran'])
    })

    // Nothing is taken off a team: the question says so, and names them.
    it('asks before taking out of the group someone a team fields', async () => {
      const user = userEvent.setup()
      data.memberGroups = [{ ...competitors, memberIds: ['p-cadet', 'p-senior', 'p-veteran'] }]
      render(<ClubCompetitions clubId={CLUB} />)
      const sen = card('Championnat par équipes')
      await user.click(within(sen).getByRole('checkbox', { name: 'Sélectionner Hervé Ceroni' }))
      await user.click(within(sen).getByRole('button', { name: 'Retirer du groupe (1)' }))

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Hervé Ceroni')
      expect(dialog).toHaveTextContent('Rien ne les retire')
      await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
      expect(data.setMemberGroupMembers).not.toHaveBeenCalled()
    })
  })

  it('asks before reserving to a group that leaves a fielded player out', async () => {
    const user = userEvent.setup()
    render(<ClubCompetitions clubId={CLUB} />)
    await user.selectOptions(within(card('Championnat par équipes')).getByRole('combobox'), 'g-comp')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Hervé Ceroni')
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(data.setCompetitionGroup).not.toHaveBeenCalled()
  })

  it('shows a plain member the group, and no way to change it', () => {
    auth.user = { id: 'p-senior', role: 'player', isPlayer: true, clubId: CLUB }
    data.competitionGroups = [{ clubId: CLUB, competitionId: 'comp-seniors', groupId: 'g-comp' }]
    render(<ClubCompetitions clubId={CLUB} />)
    const sen = card('Championnat par équipes')
    expect(within(sen).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(sen).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(sen).getByText('Compétiteurs')).toBeInTheDocument()
  })
})
