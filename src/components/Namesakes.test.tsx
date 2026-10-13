import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { Player, User } from '@/types'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'ga', role: 'general_admin', isPlayer: false } }),
}))

const { Namesakes } = await import('./Namesakes')

// #731 — Enzo Lotz, at Rixheim with his address, and again at Landser from the AGR list.

const member = (id: string, personId: string, clubId: string, email?: string): User => ({
  id, personId, clubId, email, firstName: 'Enzo', lastName: 'Lotz', licenseNumber: '', phone: '',
  status: 'active', role: 'player', isPlayer: true,
}) as User

function renderList() {
  const users = [member('enzo-rix', 'p-rix', 'rixheim', 'enzo@example.fr'), member('enzo-lan', 'p-lan', 'landser')]
  const data = {
    divisions: [], seasons: [], phases: [], competitions: [], competitionGroups: [], competitionEligibilities: [], federations: [],
    clubs: [
      { id: 'rixheim', displayName: 'Rixheim PPA', affiliationNumber: '', isArchived: false, addresses: [], channels: [] },
      { id: 'landser', displayName: 'ASL Landser', affiliationNumber: '', isArchived: false, addresses: [], channels: [] },
    ],
    groups: [], teams: [], players: users as unknown as Player[], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users,
  }
  return render(
    <MemoryRouter>
      <DataProvider initialData={data}><Namesakes /></DataProvider>
    </MemoryRouter>,
  )
}

describe('Namesakes (#731)', () => {
  it('shows the pair, the address on the side that stays', () => {
    renderList()
    expect(screen.getByText('Enzo Lotz')).toBeInTheDocument()
    expect(screen.getByText('Rixheim PPA')).toBeInTheDocument()
    expect(screen.getByText('enzo@example.fr')).toBeInTheDocument()
    expect(screen.getByText('Sans adresse')).toBeInTheDocument()
  })

  it('joins them once confirmed, and the question goes away', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'C’est la même personne' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Rixheim PPA, ASL Landser')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(screen.queryByText('Enzo Lotz')).not.toBeInTheDocument())
  })
})
