import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club, Competition, Division, Group, Phase, Season, Team } from '@/types'

const viewer = vi.hoisted(() => ({ role: 'general_admin' as string, clubId: undefined as string | undefined }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'u1', role: viewer.role, clubId: viewer.clubId, isPlayer: false } }),
}))

const { GroupsPage } = await import('./GroupsPage')
const { TeamsPage } = await import('./TeamsPage')
const { DivisionsPage } = await import('./DivisionsPage')
const { PhasesPage } = await import('./PhasesPage')
const { CompetitionsPage } = await import('./CompetitionsPage')

// #660 — a division picker offers one federation's divisions: the general
// admin chooses which, a club is held to its own, and the FFTT imports are
// not offered where the FFTT has nothing.

// One season, and each federation's active phase in it (#645).
const seasons: Season[] = [
  { id: '27', displayName: '2026/2027', status: 'active' },
]
const phase: Phase = {
  id: 'phase-27-1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active',
}
const agrPhase: Phase = {
  id: 'phase-agr-27-1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active', federationId: 'agr',
}
const club = (id: string, displayName: string, over: Partial<Club> = {}): Club => ({
  id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over,
})
const rixheim = club('club-fftt-06680011', 'Rixheim PPA', { affiliationNumber: '06680011' })
const kembs = club('club-fftt-06680140', 'Kembs TT', {
  affiliationNumber: '06680140', affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }],
})
const landser = club('club-agr-680036', 'Landser ASL', {
  affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }],
})

const competitions: Competition[] = [
  { id: 'c-agr', displayName: 'Championnat AGR', categories: [], federationId: 'agr', sortOrder: 0, isArchived: false },
  { id: 'c-fftt', displayName: 'Championnat de France', categories: [], federationId: 'fftt', sortOrder: 1, isArchived: false },
]
const division = (id: string, displayName: string, rank: number, competitionId?: string, organizationId?: string): Division => ({
  id, phaseId: competitionId ? agrPhase.id : phase.id, displayName, rank, playersPerGame: 4, isArchived: false, competitionId,
  ...(organizationId ? { organizationId } : {}),
})
const divisions = [
  division('d-ge3', 'GE 3', 1),
  division('d-n3', 'Nationale 3', 2),
  division('d-exc', 'Excellence', 1, 'c-agr', 'agr-68'),
  division('d-hon', 'Honneur', 2, 'c-agr', 'agr-67'),
]
// The AGR's two committees (#692).
const organizations = [
  { id: 'agr-68', type: 'Committee', identifier: '68', name: 'Haut-Rhin', federationId: 'agr' },
  { id: 'agr-67', type: 'Committee', identifier: '67', name: 'Bas-Rhin', federationId: 'agr' },
]
const groups: Group[] = divisions.map((d) => ({
  id: `g-${d.id}`, divisionId: d.id, number: 1, teamIds: [], isArchived: false,
}))

// Kembs 1 twice — once per federation, each in its own phase (#645).
const team = (id: string, clubId: string, divisionId: string): Team => ({
  id, clubId, phaseId: divisions.find((d) => d.id === divisionId)!.phaseId, number: 1, divisionId,
  groupId: `g-${divisionId}`, gameLocationId: '', defaultDay: 'Jeudi', defaultTime: '20h00',
  captainId: '', playerIds: [], isArchived: false,
})
const teams = [
  team('kembs-fftt-1', kembs.id, 'd-ge3'),
  team('kembs-agr-1', kembs.id, 'd-exc'),
  team('landser-1', landser.id, 'd-hon'),
]

function renderPage(page: React.ReactNode) {
  const data = {
    divisions, clubs: [rixheim, kembs, landser], seasons, phases: [phase, agrPhase], competitions, organizations,
    competitionGroups: [], competitionEligibilities: [], federations: mockFederations,
    groups, teams, players: [], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users: [],
  }
  return render(
    <MemoryRouter>
      <DataProvider initialData={data}>{page}</DataProvider>
    </MemoryRouter>,
  )
}

const as = (role: string, clubId?: string) => {
  viewer.role = role
  viewer.clubId = clubId
}
const optionsOf = (select: HTMLElement) => within(select).queryAllByRole('option').map((o) => o.textContent)

beforeEach(() => {
  // The organisation filter asks the FFTT; nothing here needs an answer.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Groupes — one federation at a time', () => {
  it('lets a general admin pick the federation, and lists only its divisions', () => {
    as('general_admin')
    renderPage(<GroupsPage />)
    const divisionPicker = screen.getByLabelText('Division')
    expect(optionsOf(divisionPicker)).toEqual(['Choisir une division…', 'GE 3', 'Nationale 3'])

    // A switch in the header, as on Divisions (#645).
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    expect(optionsOf(screen.getByLabelText('Division'))).toEqual(['Choisir une division…', 'Excellence', 'Honneur'])
    // The AGR's organisation filter offers its own committees, not the FFTT's (#692).
    expect(optionsOf(screen.getByLabelText(/Organisation/))).toEqual(['Toutes', 'Bas-Rhin (67)', 'Haut-Rhin (68)'])
  })

  it('opens « Ajouter un groupe » on the page’s federation, and switches with it', () => {
    as('general_admin')
    renderPage(<GroupsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un groupe' }))
    const dialog = screen.getByRole('dialog')
    expect(optionsOf(within(dialog).getByLabelText('Division'))).toEqual(['Excellence', 'Honneur'])

    fireEvent.change(within(dialog).getByLabelText('Fédération'), { target: { value: 'fftt' } })
    expect(optionsOf(within(dialog).getByLabelText('Division'))).toEqual(['GE 3', 'Nationale 3'])
  })

  it('holds a club of the AGR alone to the AGR, with no choice to make', () => {
    as('club_admin', landser.id)
    renderPage(<GroupsPage />)
    expect(screen.queryByLabelText('Fédération')).not.toBeInTheDocument()
    expect(optionsOf(screen.getByLabelText('Division'))).toEqual(['Choisir une division…', 'Excellence', 'Honneur'])
    expect(screen.queryByRole('button', { name: 'Importer les groupes FFTT' })).not.toBeInTheDocument()
  })

  it('names an AGR poule by its letter, and picks it by letter (#696)', () => {
    as('general_admin')
    renderPage(<GroupsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    fireEvent.change(screen.getByLabelText('Division'), { target: { value: 'd-exc' } })
    expect(screen.getByRole('columnheader', { name: 'Poule' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un groupe' }))
    const poule = within(screen.getByRole('dialog')).getByLabelText('Poule')
    expect((poule as HTMLSelectElement).selectedOptions[0].textContent).toBe('B')
  })

  it('keeps numbering an FFTT poule', () => {
    as('general_admin')
    renderPage(<GroupsPage />)
    fireEvent.change(screen.getByLabelText('Division'), { target: { value: 'd-ge3' } })
    expect(screen.getByRole('columnheader', { name: 'N° groupe' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
  })
})

describe('Équipes — the club’s federations only', () => {
  const openAdd = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une équipe' }))
    return screen.getByRole('dialog')
  }

  it('offers a club of the AGR alone its divisions, and no FFTT import', () => {
    as('club_admin', landser.id)
    renderPage(<TeamsPage />)
    expect(screen.queryByRole('button', { name: 'Importer depuis la FFTT' })).not.toBeInTheDocument()
    const dialog = openAdd()
    expect(within(dialog).queryByLabelText('Fédération')).not.toBeInTheDocument()
    expect(optionsOf(within(dialog).getByLabelText('Division'))).toEqual(['Excellence', 'Honneur'])
  })

  it('keeps the FFTT import, and the FFTT divisions, for a club of the FFTT', () => {
    as('club_admin', rixheim.id)
    renderPage(<TeamsPage />)
    expect(screen.getByRole('button', { name: 'Importer depuis la FFTT' })).toBeInTheDocument()
    expect(optionsOf(within(openAdd()).getByLabelText('Division'))).toEqual(['GE 3', 'Nationale 3'])
  })

  it('has a club in both federations pick one first', () => {
    as('club_admin', kembs.id)
    renderPage(<TeamsPage />)
    const dialog = openAdd()
    expect(optionsOf(within(dialog).getByLabelText('Fédération'))).toEqual(['FFTT', 'AGR'])
    expect(optionsOf(within(dialog).getByLabelText('Division'))).toEqual(['GE 3', 'Nationale 3'])

    fireEvent.change(within(dialog).getByLabelText('Fédération'), { target: { value: 'agr' } })
    expect(within(dialog).getByLabelText<HTMLSelectElement>('Division').value).toBe('d-exc')
    expect(within(dialog).getByLabelText<HTMLSelectElement>('Groupe').value).toBe('g-d-exc')
  })

  it('follows the club a general admin picks in the dialog', () => {
    as('general_admin')
    renderPage(<TeamsPage />)
    const dialog = openAdd()
    fireEvent.change(within(dialog).getByLabelText('Club'), { target: { value: landser.id } })
    expect(within(dialog).queryByLabelText('Fédération')).not.toBeInTheDocument()
    expect(optionsOf(within(dialog).getByLabelText('Division'))).toEqual(['Excellence', 'Honneur'])
  })

  // #645 — the federation first, then the phase.
  it('switches a club in both between its FFTT and its AGR Kembs 1', () => {
    as('club_admin', kembs.id)
    renderPage(<TeamsPage />)
    const federation = screen.getByRole('radiogroup', { name: 'Fédération' })
    expect(within(federation).getAllByRole('radio').map((r) => r.textContent)).toEqual(['FFTT', 'AGR'])
    expect(screen.getByText('GE 3 · P. 1')).toBeInTheDocument()
    fireEvent.click(within(federation).getByRole('radio', { name: 'AGR' }))
    expect(screen.getByText('Excellence · Poule A')).toBeInTheDocument()
    expect(screen.queryByText('GE 3 · P. 1')).not.toBeInTheDocument()
  })

  it('opens a club of the AGR alone on its AGR phase, with no switch', () => {
    as('club_admin', landser.id)
    renderPage(<TeamsPage />)
    expect(screen.queryByRole('radiogroup', { name: 'Fédération' })).not.toBeInTheDocument()
    expect(screen.getByText('Honneur · Poule A')).toBeInTheDocument()
  })
})

describe('Divisions — a division is its phase’s federation’s (#645)', () => {
  it('offers the AGR’s phases and competitions only, on the AGR — and no « Aucune », which is the FFTT', () => {
    as('general_admin')
    renderPage(<DivisionsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    expect(screen.getByText('Excellence')).toBeInTheDocument()
    expect(screen.queryByText('GE 3')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une division' }))
    const dialog = screen.getByRole('dialog')
    expect(optionsOf(within(dialog).getByLabelText('Phase'))).toEqual(['2026/2027 Phase 1'])
    const competition = within(dialog).getByLabelText('Compétition') as HTMLSelectElement
    expect(optionsOf(competition)).toEqual(['Championnat AGR'])
    expect(competition.value).toBe('c-agr')
  })

  it('offers the FFTT’s competitions on the FFTT, « Aucune » first', () => {
    as('general_admin')
    renderPage(<DivisionsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une division' }))
    const dialog = screen.getByRole('dialog')
    expect(optionsOf(within(dialog).getByLabelText('Compétition')))
      .toEqual(['Aucune (aucune restriction de catégorie)', 'Championnat de France'])
  })
})

describe('Phases and Compétitions — the same switch (#645)', () => {
  it('lists one federation’s phases, and creates in it', () => {
    as('general_admin')
    renderPage(<PhasesPage />)
    expect(screen.getAllByRole('row').map((r) => r.textContent)).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    expect(screen.getByRole('radio', { name: 'AGR' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une phase' }))
    expect((within(screen.getByRole('dialog')).getByLabelText('Fédération') as HTMLSelectElement).value).toBe('agr')
  })

  it('lists one federation’s competitions, the FFTT import on the FFTT only', () => {
    as('general_admin')
    renderPage(<CompetitionsPage />)
    expect(screen.getByText('Championnat de France')).toBeInTheDocument()
    expect(screen.queryByText('Championnat AGR')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    expect(screen.getByText('Championnat AGR')).toBeInTheDocument()
    expect(screen.queryByText('Championnat de France')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importer depuis la FFTT' })).not.toBeInTheDocument()
  })
})

describe('Organisation — the AGR’s committees, from our data (#692)', () => {
  it('narrows the AGR’s divisions to one committee, without asking the FFTT', () => {
    as('general_admin')
    renderPage(<DivisionsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    fireEvent.change(screen.getByLabelText(/Organisation/), { target: { value: 'agr-67' } })
    expect(screen.getByText('Honneur')).toBeInTheDocument()
    expect(screen.queryByText('Excellence')).not.toBeInTheDocument()
  })
})
