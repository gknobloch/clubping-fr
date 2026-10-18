import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club, Team } from '@/types'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'ga', role: 'general_admin', isPlayer: false } }),
}))

const { ClubsPage } = await import('./ClubsPage')

// #730 — the AGR import left « Kembs ASL TT » beside the FFTT's « Kembs TT ».

const club = (id: string, displayName: string, over: Partial<Club> = {}): Club => ({
  id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over,
})
const team = (id: string, clubId: string, phaseId: string, number: number) =>
  ({ id, clubId, phaseId, number, groupId: 'g', isArchived: false, playerIds: [], captainId: '' }) as unknown as Team

function renderPage(teams: Team[] = [team('t-agr', 'club-x', 'phase-agr-27-1', 1)]) {
  const data = {
    divisions: [], seasons: [], phases: [], competitions: [], competitionGroups: [],
    federations: mockFederations,
    clubs: [
      club('club-fftt-06680140', 'Kembs TT', { affiliationNumber: '06680140' }),
      club('club-x', 'Kembs ASL TT', { affiliations: [{ federationId: 'agr', affiliationNumber: '', name: 'KEMBS ASL TT' }] }),
      club('club-fftt-06680011', 'Rixheim PPA', { affiliationNumber: '06680011' }),
    ],
    groups: [], teams, players: [], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users: [],
  }
  return render(
    <MemoryRouter initialEntries={['/clubs']}>
      <DataProvider initialData={data}><ClubsPage /></DataProvider>
    </MemoryRouter>,
  )
}

const openMerge = (name: string) => {
  const row = screen.getByText(name).closest('tr')!
  fireEvent.click(within(row).getAllByRole('button', { name: 'Fusionner…' })[0])
  return screen.getByRole('dialog')
}

describe('ClubsPage — merging two rows of one club (#730)', () => {
  it('offers the clubs of the same town first, and says which row stays', () => {
    renderPage()
    const dialog = openMerge('Kembs ASL TT')
    const select = within(dialog).getByLabelText('Avec')
    expect(within(select).getByRole('group', { name: 'Même ville' })).toHaveTextContent('Kembs TT')
    fireEvent.change(select, { target: { value: 'club-fftt-06680140' } })
    const summary = within(dialog).getByTestId('merge-club-summary')
    expect(summary).toHaveTextContent('Gardé : Kembs TT')
    expect(summary).toHaveTextContent('Supprimé : Kembs ASL TT — 1 équipe, 0 membre, 0 adresse')
  })

  it('keeps the FFTT row even when started from it', () => {
    renderPage()
    const dialog = openMerge('Kembs TT')
    fireEvent.change(within(dialog).getByLabelText('Avec'), { target: { value: 'club-x' } })
    expect(within(dialog).getByTestId('merge-club-summary')).toHaveTextContent('Gardé : Kembs TT')
  })

  it('says why two FFTT clubs cannot be merged, and waits', () => {
    renderPage()
    const dialog = openMerge('Kembs TT')
    fireEvent.change(within(dialog).getByLabelText('Avec'), { target: { value: 'club-fftt-06680011' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Deux numéros FFTT différents')
    expect(within(dialog).getByRole('button', { name: 'Fusionner' })).toBeDisabled()
  })

  it('merges: one Kembs left, with the AGR affiliation and the team', async () => {
    renderPage()
    const dialog = openMerge('Kembs ASL TT')
    fireEvent.change(within(dialog).getByLabelText('Avec'), { target: { value: 'club-fftt-06680140' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fusionner' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('Kembs ASL TT')).not.toBeInTheDocument()
    expect(within(screen.getByText('Kembs TT').closest('tr')!).getByText('AGR')).toBeInTheDocument()
  })
})
