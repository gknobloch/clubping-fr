import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { Club, Player, User } from '@/types'

// #655, 4 bis — one address, one person: a child has none, so cannot sign in
// to name their parent. The admin of every club the child plays in can, from
// the fiche, as the general admin always could.

const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, token: null, refreshProfiles: vi.fn() }),
}))

const { PlayerDetailPage } = await import('./PlayerDetailPage')

const club = (id: string): Club => ({ id, affiliationNumber: '', displayName: id, isArchived: false, addresses: [], channels: [] })
const player = (id: string, personId: string, clubId: string): Player => ({
  id, personId, firstName: id, lastName: 'Henaut', licenseNumber: '', phone: '', status: 'active', clubId,
})
// Lou plays in club-a only; Gilles in club-a and club-b.
const players = [
  player('lou', 'p-lou', 'club-a'),
  player('g-a', 'p-g', 'club-a'),
  player('g-b', 'p-g', 'club-b'),
]

function renderPlayer(id: string, viewer: Partial<User>) {
  auth.user = { isPlayer: false, ...viewer }
  return render(
    <MemoryRouter initialEntries={[`/joueurs/${id}`]}>
      <DataProvider
        initialData={{
          divisions: [], clubs: [club('club-a'), club('club-b')], seasons: [], phases: [], competitions: [],
          competitionGroups: [], federations: [], groups: [], teams: [], players,
          matchDays: [], games: [], gameAvailabilities: [], gameSelections: [],
          users: players.map((p) => ({ ...p, role: 'player', isPlayer: true })),
          playerSeasonLicences: [], playerSeasonCategories: [], memberGroups: [],
          trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [],
        }}
      >
        <Routes>
          <Route path="/joueurs/:id" element={<PlayerDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

const delegations = () => screen.queryByRole('heading', { name: 'Délégations' })

describe('PlayerDetailPage — délégations (#655, 4 bis)', () => {
  it('offers them to the admin of the club the member plays in', async () => {
    renderPlayer('lou', { id: 'ca', role: 'club_admin', clubId: 'club-a' })
    expect(delegations()).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Ajouter un délégué' })).toBeInTheDocument()
  })

  it('not to the admin of another club', () => {
    renderPlayer('lou', { id: 'cb', role: 'club_admin', clubId: 'club-b' })
    expect(delegations()).not.toBeInTheDocument()
  })

  it('not to one club’s admin for a person who also plays elsewhere', () => {
    renderPlayer('g-a', { id: 'ca', role: 'club_admin', clubId: 'club-a' })
    expect(delegations()).not.toBeInTheDocument()
  })

  it('not to a player', () => {
    renderPlayer('lou', { id: 'x', role: 'player', clubId: 'club-a', isPlayer: true })
    expect(delegations()).not.toBeInTheDocument()
  })
})
