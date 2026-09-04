import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import type { Competition, CompetitionEligibility, Player } from '@/types'
import { ClubCompetitions } from './ClubCompetitions'

// Each name links to the player behind it, so the tree needs a router.
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

// #482 — the club's half of the feature. The rule itself lives in
// src/lib/competitionEligibility.spec.ts and the writes in the API's own suite;
// what matters here is that the screen obeys it: it sorts the club into
// eligible and not, it says on what grounds, it offers no way into a locked
// competition, and it shows the API's refusal rather than inventing one.

const CLUB = 'club-1'

const data = vi.hoisted(() => ({
  setCompetitionEligibility: vi.fn(),
  competitions: [] as Competition[],
  players: [] as Player[],
  competitionEligibilities: [] as CompetitionEligibility[],
}))
const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: false,
  useAuth: () => ({ user: auth.user, token: null, logout: vi.fn() }),
}))

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    competitions: data.competitions,
    players: data.players,
    competitionEligibilities: data.competitionEligibilities,
    setCompetitionEligibility: data.setCompetitionEligibility,
  }),
}))

const player = (id: string, first: string, last: string, category?: string): Player => ({
  id, firstName: first, lastName: last, licenseNumber: '1', phone: '',
  status: 'active', clubId: CLUB, ...(category ? { category } : {}),
})

const youth: Competition = {
  id: 'comp-jeunes', displayName: 'Championnat jeunes',
  categories: ['B', 'M', 'C', 'J'], isCategoryLocked: true, sortOrder: 1, isArchived: false,
}
const veterans: Competition = {
  id: 'comp-veterans', displayName: 'Championnat vétérans',
  categories: ['V50', 'V55'], isCategoryLocked: false, sortOrder: 2, isArchived: false,
}

const CADET = player('p-cadet', 'Samuel', 'Canemolla', 'C1')
const SENIOR = player('p-senior', 'Joris', 'Szulc', 'S')
const VETERAN = player('p-veteran', 'Hervé', 'Ceroni', 'V55')

beforeEach(() => {
  data.setCompetitionEligibility.mockReset().mockResolvedValue(true)
  data.competitions = [youth, veterans]
  data.players = [CADET, SENIOR, VETERAN]
  data.competitionEligibilities = []
  auth.user = { id: 'ca', role: 'club_admin', isPlayer: false, clubId: CLUB }
})

/** The list under a heading, so "Éligibles" and "Non éligibles" stay apart. */
const listUnder = (heading: RegExp) =>
  screen.getByRole('heading', { name: heading }).nextElementSibling as HTMLElement

describe('ClubCompetitions (#482)', () => {
  it('sorts the club by the competition selected, and says on what grounds', () => {
    render(<ClubCompetitions clubId={CLUB} />)
    // The first competition is selected by default.
    expect(within(listUnder(/^Éligibles/)).getByText('Samuel Canemolla')).toBeInTheDocument()
    expect(within(listUnder(/^Éligibles/)).getByText(/Cadet \(C1\) · Par sa catégorie/)).toBeInTheDocument()
    const rest = within(listUnder(/^Non éligibles/))
    expect(rest.getByText('Joris Szulc')).toBeInTheDocument()
    expect(rest.getByText(/Senior · Hors catégorie/)).toBeInTheDocument()
  })

  it('offers no way into a locked competition', () => {
    render(<ClubCompetitions clubId={CLUB} />)
    const rest = within(listUnder(/^Non éligibles/))
    expect(rest.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument()
    expect(rest.getAllByText('Compétition réservée').length).toBeGreaterThan(0)
  })

  it('lets a club add someone to a competition that is not locked', async () => {
    render(<ClubCompetitions clubId={CLUB} />)
    await userEvent.selectOptions(screen.getByLabelText('Compétition'), 'comp-veterans')

    const rest = within(listUnder(/^Non éligibles/))
    const row = rest.getByText('Joris Szulc').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Ajouter' }))

    expect(data.setCompetitionEligibility)
      .toHaveBeenCalledWith(CLUB, 'comp-veterans', 'p-senior', 'included')
  })

  it('lets a club exclude someone the default admits', async () => {
    render(<ClubCompetitions clubId={CLUB} />)
    const row = within(listUnder(/^Éligibles/)).getByText('Samuel Canemolla').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Exclure' }))

    expect(data.setCompetitionEligibility)
      .toHaveBeenCalledWith(CLUB, 'comp-jeunes', 'p-cadet', 'excluded')
  })

  it('offers to undo an amendment rather than to make a second one', async () => {
    data.competitionEligibilities = [
      { clubId: CLUB, competitionId: 'comp-jeunes', playerId: 'p-cadet', effect: 'excluded' },
    ]
    render(<ClubCompetitions clubId={CLUB} />)
    const row = within(listUnder(/^Non éligibles/)).getByText('Samuel Canemolla').closest('li')!
    expect(within(row).getByText(/Exclu par le club/)).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Rétablir le défaut' }))

    expect(data.setCompetitionEligibility)
      .toHaveBeenCalledWith(CLUB, 'comp-jeunes', 'p-cadet', 'default')
  })

  // Another club's exception must not decide this club's list.
  it('reads only its own club’s amendments', () => {
    data.competitionEligibilities = [
      { clubId: 'club-2', competitionId: 'comp-jeunes', playerId: 'p-cadet', effect: 'excluded' },
    ]
    render(<ClubCompetitions clubId={CLUB} />)
    expect(within(listUnder(/^Éligibles/)).getByText('Samuel Canemolla')).toBeInTheDocument()
  })

  it('shows the API’s refusal rather than pretending it worked', async () => {
    data.setCompetitionEligibility.mockResolvedValue(false)
    render(<ClubCompetitions clubId={CLUB} />)
    await userEvent.selectOptions(screen.getByLabelText('Compétition'), 'comp-veterans')
    const row = within(listUnder(/^Non éligibles/)).getByText('Joris Szulc').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Ajouter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/réservée à certaines catégories/)
  })

  it('reads without amending for anyone who does not administer the club', () => {
    auth.user = { id: 'p1', role: 'player', isPlayer: true, clubId: CLUB }
    render(<ClubCompetitions clubId={CLUB} />)
    expect(screen.getByText('Samuel Canemolla')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exclure' })).not.toBeInTheDocument()
  })

  it('says nothing is restricted when no competition exists', () => {
    data.competitions = []
    render(<ClubCompetitions clubId={CLUB} />)
    expect(screen.getByText(/Aucune compétition n'est définie/)).toBeInTheDocument()
  })
})
