import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { Player, User } from '@/types'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'ga', role: 'general_admin', isPlayer: false } }),
}))

const { MergePersonDialog } = await import('./MergePersonDialog')

// #733 — the FFTT's Vincent Rambeau (Rixheim, with his address) is the AGR's
// Vincent Rambeaux (Landser, none).

const member = (id: string, personId: string, lastName: string, clubId: string, email?: string) => ({
  id, personId, clubId, email, firstName: 'Vincent', lastName, licenseNumber: '', phone: '',
  status: 'active', role: 'player', isPlayer: true,
}) as User
const rix = member('v-rix', 'p-rix', 'Rambeau', 'rixheim', 'v@example.fr')
const lan = member('v-lan', 'p-lan', 'Rambeaux', 'landser')
const other = member('v-other', 'p-other', 'Durand', 'landser')

function renderDialog(onClose = vi.fn()) {
  const users = [rix, lan, other]
  const data = {
    divisions: [], seasons: [], phases: [], competitions: [], competitionGroups: [], federations: [],
    clubs: [
      { id: 'rixheim', displayName: 'Rixheim PPA', affiliationNumber: '', isArchived: false, addresses: [], channels: [] },
      { id: 'landser', displayName: 'ASL Landser', affiliationNumber: '', isArchived: false, addresses: [], channels: [] },
    ],
    groups: [], teams: [], players: users as unknown as Player[], playerSeasonCategories: [], playerSeasonLicences: [],
    memberGroups: [], trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [],
    games: [], gameAvailabilities: [], gameSelections: [], users,
  }
  render(
    <MemoryRouter>
      <DataProvider initialData={data}>
        <MergePersonDialog player={lan as unknown as Player} onClose={onClose} />
      </DataProvider>
    </MemoryRouter>,
  )
  return onClose
}

describe('MergePersonDialog (#733)', () => {
  it('offers the close spelling first, and keeps the person with the address', async () => {
    const onClose = renderDialog()
    expect(screen.getByText('Noms proches')).toBeInTheDocument()
    expect(screen.getByText('Vincent Rambeau')).toBeInTheDocument()
    expect(screen.queryByText('Vincent Durand')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio'))
    expect(screen.getByTestId('merge-person-summary')).toHaveTextContent('Gardée : Vincent Rambeau (v@example.fr)')
    fireEvent.click(screen.getByRole('button', { name: 'Réunir' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('finds anyone by search', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Rechercher une personne'), { target: { value: 'dur' } })
    expect(screen.getByText('Vincent Durand')).toBeInTheDocument()
  })
})
