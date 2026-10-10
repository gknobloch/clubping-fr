import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club, Competition, Division, Group, Phase } from '@/types'

const viewer = vi.hoisted(() => ({ role: 'general_admin' as string, clubId: undefined as string | undefined }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'u1', role: viewer.role, clubId: viewer.clubId, isPlayer: false } }),
}))

const { GroupsPage } = await import('./GroupsPage')
const { TeamsPage } = await import('./TeamsPage')

// #660 — a division picker offers one federation's divisions: the general
// admin chooses which, a club is held to its own, and the FFTT imports are
// not offered where the FFTT has nothing.

const phase: Phase = {
  id: 'phase-27-1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active',
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
]
const division = (id: string, displayName: string, rank: number, competitionId?: string): Division => ({
  id, phaseId: phase.id, displayName, rank, playersPerGame: 4, isArchived: false, competitionId,
})
const divisions = [
  division('d-ge3', 'GE 3', 1),
  division('d-n3', 'Nationale 3', 2),
  division('d-exc', 'Excellence', 1, 'c-agr'),
  division('d-hon', 'Honneur', 2, 'c-agr'),
]
const groups: Group[] = divisions.map((d) => ({
  id: `g-${d.id}`, divisionId: d.id, number: 1, teamIds: [], isArchived: false,
}))

function renderPage(page: React.ReactNode) {
  const data = {
    divisions, clubs: [rixheim, kembs, landser], seasons: [], phases: [phase], competitions,
    competitionGroups: [], competitionEligibilities: [], federations: mockFederations,
    groups, teams: [], players: [], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
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

    fireEvent.change(screen.getByLabelText('Fédération'), { target: { value: 'agr' } })
    expect(optionsOf(screen.getByLabelText('Division'))).toEqual(['Choisir une division…', 'Excellence', 'Honneur'])
    // The FFTT's organisation filter means nothing to the AGR.
    expect(screen.queryByLabelText(/Organisation/)).not.toBeInTheDocument()
  })

  it('opens « Ajouter un groupe » on the page’s federation, and switches with it', () => {
    as('general_admin')
    renderPage(<GroupsPage />)
    fireEvent.change(screen.getByLabelText('Fédération'), { target: { value: 'agr' } })
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
})
