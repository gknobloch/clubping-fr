import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DataState } from '@/types'
import { DataProvider, useAppData } from '@/contexts/DataContext'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ token: null, logout: vi.fn() }),
}))

// #765 — the AGR list looks for the club's namesakes in `users`. An FFTT
// import then an AGR one, without a reload between, found nobody there: the
// first import's players were only in `players`.
const initialData: DataState = {
  divisions: [], competitions: [], competitionGroups: [], federations: [],
  clubs: [{ id: 'club-1', affiliationNumber: '06670183', displayName: 'FCJ Bootzheim', isArchived: false, addresses: [], channels: [] }],
  seasons: [], phases: [], groups: [], teams: [],
  playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
  trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [],
  players: [], matchDays: [], games: [], gameAvailabilities: [], gameSelections: [], users: [],
}

function Consumer() {
  const { users, addPlayer, updatePlayer } = useAppData()
  return (
    <div>
      <button type="button" onClick={() => addPlayer({
        id: 'p-moreau', firstName: 'Fabrice', lastName: 'Moreau', licenseNumber: '6725947',
        email: '', phone: '', status: 'active', clubId: 'club-1',
      })}>add</button>
      <button type="button" onClick={() => updatePlayer('p-moreau', { licenseNumber: '6725948' })}>update</button>
      <span data-testid="users">{users.map((u) => `${u.id}:${u.firstName} ${u.lastName}:${u.licenseNumber}:${u.isPlayer}`).join(',')}</span>
    </div>
  )
}

describe('players and users stay one table (#765)', () => {
  it('lists a player just added among the users, and follows their edits there', async () => {
    render(<DataProvider initialData={initialData}><Consumer /></DataProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(screen.getByTestId('users').textContent).toBe('p-moreau:Fabrice Moreau:6725947:true')
    await userEvent.click(screen.getByRole('button', { name: 'update' }))
    expect(screen.getByTestId('users').textContent).toBe('p-moreau:Fabrice Moreau:6725948:true')
  })
})
