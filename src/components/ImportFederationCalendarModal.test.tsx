import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club, Competition, DataState, Division, Phase, Season } from '@/types'
import { PROM_HONNEUR_A_PHASE_1, PROM_HONNEUR_A_PHASE_2 } from '@/lib/__fixtures__/agrSchedules'

// #647 — the review of an AGR calendar: phase, competition, and which club
// each name is, before anything is written.

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, token: null }) }))
const extract = vi.hoisted(() => ({ lines: [] as string[] }))
vi.mock('@/lib/pdfScheduleText', () => ({ extractPdfScheduleLines: async () => extract.lines }))

const { ImportFederationCalendarModal } = await import('./ImportFederationCalendarModal')

const club = (id: string, displayName: string, over: Partial<Club> = {}): Club =>
  ({ id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over })
const clubs = [
  // Created by an import before #704, still in capitals: offered as it will read.
  club('lutterbach', 'LUTTERBACH SG', { affiliations: [{ federationId: 'agr', affiliationNumber: '', name: 'LUTTERBACH SG' }] }),
  club('landser', 'Landser ASL', { affiliations: [{ federationId: 'agr', affiliationNumber: '680036', organizationId: 'agr-68' }] }),
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
  { id: 'c-bas', displayName: 'Championnat du Bas-Rhin', categories: [], federationId: 'agr', sortOrder: 1, isArchived: false },
  { id: 'c-haut', displayName: 'Championnat du Haut-Rhin', categories: [], federationId: 'agr', sortOrder: 2, isArchived: false },
]
const organizations = [
  { id: 'agr-68', type: 'Committee', identifier: '68', name: 'Haut-Rhin', federationId: 'agr' },
  { id: 'agr-67', type: 'Committee', identifier: '67', name: 'Bas-Rhin', federationId: 'agr' },
]

function open(
  viewerClubId?: string, divisions: Division[] = [], lines = PROM_HONNEUR_A_PHASE_1, phaseList = phases,
  placed: Pick<DataState, 'groups' | 'teams' | 'matchDays' | 'games' | 'gameAvailabilities'> =
    { groups: [], teams: [], matchDays: [], games: [], gameAvailabilities: [] },
) {
  extract.lines = lines
  render(
    <DataProvider
      initialData={{
        divisions, clubs, seasons, phases: phaseList, competitions, organizations, competitionGroups: [],
        federations: mockFederations, players: [], playerSeasonCategories: [],
        playerSeasonLicences: [], memberGroups: [], trainings: [], trainingSessions: [], trainingAvailabilities: [],
        playerPhasePoints: [], gameSelections: [], users: [], ...placed,
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
    // Landser is AGR Haut-Rhin (#692): its organisation, and that organisation's championship.
    expect((screen.getByLabelText('Organisation') as HTMLSelectElement).value).toBe('agr-68')
    expect((screen.getByLabelText('Compétition') as HTMLSelectElement).value).toBe('c-haut')
    fireEvent.change(screen.getByLabelText('Organisation'), { target: { value: 'agr-67' } })
    expect((screen.getByLabelText('Compétition') as HTMLSelectElement).value).toBe('c-bas')
    fireEvent.change(screen.getByLabelText('Organisation'), { target: { value: 'agr-68' } })
    // Landser by its display name, Kembs by its AGR name, the rest to create.
    expect(clubSelect('LANDSER ASL').value).toBe('landser')
    expect(clubSelect('KEMBS ASL TT').value).toBe('kembs')
    expect(clubSelect('SPECHBACH MJC').value).toBe('')
    // Named as the import will write them (#708): created spelled for people.
    expect(clubSelect('SPECHBACH MJC').selectedOptions[0].textContent).toBe('Créer « Spechbach MJC »')
    expect(screen.getByText('KIRCHBERG/NIEDERBRUCK 4 JOUE A NIEDERBRUCK')).toBeInTheDocument()
    expect(within(clubSelect('SPECHBACH MJC')).getByRole('option', { name: 'Lutterbach SG' })).toBeInTheDocument()
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
        divisions: [], clubs, seasons, phases, competitions, competitionGroups: [],
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

  it('proposes the phase’s division the calendar means — « Prom. HONNEUR » is « Promotion Honneur » (#647)', async () => {
    open('landser', [
      { id: 'd-exc', phaseId: 'phase-agr-27-1', displayName: 'Excellence', rank: 1, playersPerGame: 4, isArchived: false, competitionId: 'c-agr' },
      { id: 'd-ph', phaseId: 'phase-agr-27-1', displayName: 'Promotion Honneur', rank: 4, playersPerGame: 4, isArchived: false, competitionId: 'c-agr' },
    ])
    const division = await screen.findByLabelText('Division') as HTMLSelectElement
    expect(division.value).toBe('d-ph')
    // Changeable, and « create » stays offered.
    expect(within(division).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Créer « Prom. HONNEUR »', 'Excellence', 'Promotion Honneur'])
  })

  it('names the teams it takes out of another poule, and what leaves with them (#763)', async () => {
    const team = (id: string, clubId: string, number: number) => ({
      id, clubId, phaseId: 'phase-agr-27-1', number, divisionId: 'd-pe', groupId: 'g-wrong', gameLocationId: '', defaultDay: '',
      defaultTime: '', captainId: '', playerIds: [], isArchived: false,
    })
    open('landser', [
      { id: 'd-pe', phaseId: 'phase-agr-27-1', displayName: 'Promotion Excellence', rank: 2, playersPerGame: 4, isArchived: false, competitionId: 'c-agr' },
      { id: 'd-ph', phaseId: 'phase-agr-27-1', displayName: 'Promotion Honneur', rank: 4, playersPerGame: 4, isArchived: false, competitionId: 'c-agr' },
    ], PROM_HONNEUR_A_PHASE_1, phases, {
      groups: [{ id: 'g-wrong', divisionId: 'd-pe', number: 2, teamIds: ['t-landser-2', 't-kembs-4'], isArchived: false }],
      teams: [team('t-landser-2', 'landser', 2), team('t-kembs-4', 'kembs', 4)],
      matchDays: [{ id: 'md-1', groupId: 'g-wrong', number: 1, date: '2026-09-25' }],
      games: [{ id: 'g-1', matchDayId: 'md-1', homeTeamId: 't-landser-2', awayTeamId: 't-kembs-4' }],
      gameAvailabilities: [{ gameId: 'g-1', playerId: 'p-1', status: 'available' }],
    })
    const alert = await screen.findByText(/Ces équipes sont déjà dans une autre poule de la phase/)
    expect(alert).toHaveTextContent('Landser ASL 2 — Promotion Excellence · Poule B')
    expect(alert).toHaveTextContent('Kembs TT 4 — Promotion Excellence · Poule B')
    expect(alert).toHaveTextContent('Leurs 1 rencontre(s) dans l’ancienne poule sont supprimées, avec les disponibilités et compositions déjà saisies.')
  })

  it('chooses no phase for a phase-2 calendar when the AGR has no phase 2, and says so', async () => {
    open('landser', [], PROM_HONNEUR_A_PHASE_2, phases.slice(0, 1))
    expect(await screen.findByText(/La phase 2 2026\/2027 de l’AGR n’existe pas encore/)).toBeInTheDocument()
    expect((screen.getByLabelText('Phase') as HTMLSelectElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled()
    // Chosen by hand anyway, the mismatch is said.
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: 'phase-agr-27-1' } })
    expect(screen.getByText('Ce calendrier est celui de la phase 2, pas de 2026/2027 Phase 1.')).toBeInTheDocument()
  })
})
