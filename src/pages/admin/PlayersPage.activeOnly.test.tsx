import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, Player, Role } from '@/types'
import { PlayersPage } from './PlayersPage'

// #438. The Joueurs list is the club directory: an archived member has left,
// and a member looking someone up should not be handed a stale row. Only the
// people who administer the club can widen the list, and it still opens closed.

const auth = vi.hoisted(() => ({ role: 'club_admin' as Role }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({
    token: null,
    logout: vi.fn(),
    user: {
      id: 'u1', email: 'a@club.fr', role: auth.role, isPlayer: false, clubId: 'club-1',
    },
  }),
}))

const club: Club = {
  id: 'club-1', affiliationNumber: '06680011', displayName: 'PPA Rixheim',
  isArchived: false, addresses: [], channels: [],
}
const active: Player = {
  id: 'p1', firstName: 'Joris', lastName: 'Szulc', licenseNumber: '686956',
  phone: '0600000000', status: 'active', clubId: 'club-1',
}
const archived: Player = {
  id: 'p2', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '681234',
  phone: '0611111111', status: 'archived', clubId: 'club-1',
}

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    players: [active, archived],
    clubs: [club],
    updatePlayer: vi.fn(),
    addPlayer: vi.fn(),
  }),
}))

const renderPage = (role: Role) => {
  auth.role = role
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
}

const toggle = () => screen.getByRole('checkbox', { name: 'Joueurs actifs uniquement' })

// The page renders the mobile card list and the desktop table at once — only
// CSS separates them — so every name is in the DOM twice here.
const shown = (name: string) => screen.queryAllByText(name).length > 0

beforeEach(cleanup)

describe('PlayersPage — joueurs actifs uniquement (#438)', () => {
  it('opens on the active roster for an admin, with the toggle on', () => {
    renderPage('club_admin')
    expect(toggle()).toBeChecked()
    expect(shown('Joris Szulc')).toBe(true)
    expect(shown('Ancien Membre')).toBe(false)
  })

  it('brings the archived ones in when an admin turns it off', async () => {
    const user = userEvent.setup()
    renderPage('club_admin')
    await user.click(toggle())

    expect(shown('Ancien Membre')).toBe(true)
    expect(shown('Archivé')).toBe(true)
  })

  it('gives a member no toggle, and no archived rows', () => {
    renderPage('player')
    expect(screen.queryByRole('checkbox', { name: 'Joueurs actifs uniquement' })).toBeNull()
    expect(shown('Joris Szulc')).toBe(true)
    expect(shown('Ancien Membre')).toBe(false)
  })

  // The dropdown it replaces had a «Tous» option open to anyone signed in.
  it('no longer offers the Statut dropdown', () => {
    renderPage('club_admin')
    expect(screen.queryByRole('combobox', { name: 'Statut' })).toBeNull()
  })
})
