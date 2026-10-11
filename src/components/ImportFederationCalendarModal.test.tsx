import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club, Competition, Division, Phase, Season } from '@/types'
import { PROM_HONNEUR_A_PHASE_1 } from '@/lib/__fixtures__/agrSchedules'

// #647 — the review of an AGR calendar: phase, competition, and which club
// each name is, before anything is written.

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, token: null }) }))
const extract = vi.hoisted(() => ({ lines: [] as string[] }))
vi.mock('@/lib/pdfScheduleText', () => ({ extractPdfScheduleLines: async () => extract.lines }))

const { ImportFederationCalendarModal } = await import('./ImportFederationCalendarModal')

const club = (id: string, displayName: string, over: Partial<Club> = {}): Club =>
  ({ id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over })
const clubs = [
  club('landser', 'Landser ASL', { affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] }),
  club('kembs', 'Kembs TT', { affiliationNumber: '06680140', affiliations: [{ federationId: 'agr', affiliationNumber: '680021', name: 'KEMBS ASL TT' }] }),
  club('rixheim', 'Rixheim PPA', { affiliationNumber: '06680011' }),
]
const seasons: Season[] = [{ id: '27', displayName: '2026/2027', status: 'active' }]
const phases: Phase[] = [
  { id: 'phase-agr-27-1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active', federationId: 'agr' },
  { id: 'phase-agr-27-2', seasonId: '27', name: 'Phase 2', displayName: '2026/2027 Phase 2', status: 'upcoming', federationId: 'agr' },
]
const competitions: Competition[] = [
  { id: 'c-agr', displayName: 'Championnat Messieurs', categories: [], federationId: 'agr', sortOrder: 0, isArchived: false },
]

function open(viewerClubId?: string, divisions: Division[] = []) {
  extract.lines = PROM_HONNEUR_A_PHASE_1
  render(
    <DataProvider
      initialData={{
        divisions, clubs, seasons, phases, competitions, competitionGroups: [], competitionEligibilities: [],
        federations: mockFederations, groups: [], teams: [], players: [], playerSeasonCategories: [],
        playerSeasonLicences: [], memberGroups: [], trainings: [], trainingSessions: [], trainingAvailabilities: [],
        playerPhasePoints: [], matchDays: [], games: [], gameAvailabilities: [], gameSelections: [], users: [],
      }}
    >
      <ImportFederationCalendarModal federationId="agr" viewerClubId={viewerClubId} onClose={() => {}} />
    </DataProvider>,
  )
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'Eq2-P1.pdf', { type: 'application/pdf' })] } })
}

const clubSelect = (name: string) =>
  within(screen.getByText(name).closest('li')!).getByRole('combobox') as HTMLSelectElement

describe('ImportFederationCalendarModal', () => {
  it('reads the calendar and proposes the phase, the competition and the clubs it knows', async () => {
    open('landser')
    expect(await screen.findByText('Prom. HONNEUR · Poule A · Phase 1')).toBeInTheDocument()
    expect(screen.getByText(/7 journées \(J1 à J7\), 28 rencontres, 7 clubs/)).toBeInTheDocument()
    expect((screen.getByLabelText('Phase') as HTMLSelectElement).value).toBe('phase-agr-27-1')
    expect((screen.getByLabelText('Compétition') as HTMLSelectElement).value).toBe('c-agr')
    // Landser by its display name, Kembs by its AGR name, the rest to create.
    expect(clubSelect('LANDSER ASL').value).toBe('landser')
    expect(clubSelect('KEMBS ASL TT').value).toBe('kembs')
    expect(clubSelect('SPECHBACH MJC').value).toBe('')
    expect(screen.getByText('KIRCHBERG/NIEDERBRUCK 4 JOUE A NIEDERBRUCK')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeEnabled()
  })

  it('asks what phase 2 is, and starts from what the division already says (#649)', async () => {
    open('landser', [{
      id: 'd1', phaseId: 'phase-agr-27-1', displayName: 'Prom. Honneur', rank: 1, playersPerGame: 4,
      isArchived: false, secondPhase: 'return_leg',
    }])
    const select = await screen.findByLabelText('Phase 2') as HTMLSelectElement
    expect(select.value).toBe('return_leg')
    expect(screen.getByText(/le calendrier de la phase 2 les datera/)).toBeInTheDocument()
  })

  it('will not let a club admin import a poule their club is not in', async () => {
    open('rixheim')
    expect(await screen.findByText(/Votre club doit figurer dans ce calendrier/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled()
  })

  it('says so when the file is not an AGR calendar', async () => {
    extract.lines = []
    render(
      <DataProvider initialData={{
        divisions: [], clubs, seasons, phases, competitions, competitionGroups: [], competitionEligibilities: [],
        federations: mockFederations, groups: [], teams: [], players: [], playerSeasonCategories: [],
        playerSeasonLicences: [], memberGroups: [], trainings: [], trainingSessions: [], trainingAvailabilities: [],
        playerPhasePoints: [], matchDays: [], games: [], gameAvailabilities: [], gameSelections: [], users: [],
      }}>
        <ImportFederationCalendarModal federationId="agr" onClose={() => {}} />
      </DataProvider>,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('pas de texte lisible')
  })
})
