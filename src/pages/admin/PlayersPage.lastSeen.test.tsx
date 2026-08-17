import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, Player, Role } from '@/types'
import { PlayersPage } from './PlayersPage'

// #406 — a club that has just shared the app needs to see who has opened it.
// The page is the whole answer for a club admin, so what is pinned here is the
// reading of the list: how many have arrived, who never has, and the fact that
// none of it exists for a member who does not administer the club.

const auth = vi.hoisted(() => ({ role: 'club_admin' as Role }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({
    token: null,
    logout: vi.fn(),
    user: { id: 'u1', email: 'admin@club.fr', role: auth.role, isPlayer: false, clubId: 'club-1' },
  }),
}))

const club: Club = {
  id: 'club-1', affiliationNumber: '06680011', displayName: 'PPA Rixheim',
  isArchived: false, addresses: [], channels: [],
}

const daysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const base = { licenseNumber: '1', phone: '', status: 'active' as const, clubId: 'club-1' }
const today: Player = { ...base, id: 'p1', firstName: 'Joris', lastName: 'Szulc', lastSeenAt: daysAgo(0) }
const lastWeek: Player = { ...base, id: 'p2', firstName: 'Grégory', lastName: 'Canaque', lastSeenAt: daysAgo(3) }
const never: Player = { ...base, id: 'p3', firstName: 'Enzo', lastName: 'Lotz' }
const archived: Player = { ...base, id: 'p4', firstName: 'Nello', lastName: 'Cristini', status: 'archived' }

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    players: [today, lastWeek, never, archived],
    clubs: [club],
    updatePlayer: vi.fn(),
    addPlayer: vi.fn(),
  }),
}))

const renderPage = () => {
  const user = userEvent.setup()
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
  return user
}

/** The row of the desktop table for one member. */
const rowFor = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

beforeEach(() => {
  auth.role = 'club_admin'
})

describe('Joueurs — last visit, for the people who administer the club (#406)', () => {
  it('dates each member\'s last visit, and says plainly when there was none', () => {
    renderPage()
    expect(screen.getByRole('columnheader', { name: 'Dernière visite' })).toBeInTheDocument()

    expect(within(rowFor('Joris Szulc')).getByText("Aujourd'hui")).toBeInTheDocument()
    expect(within(rowFor('Grégory Canaque')).getByText('Il y a 3 jours')).toBeInTheDocument()
    expect(within(rowFor('Enzo Lotz')).getByText('Jamais')).toBeInTheDocument()
  })

  it('counts how far the app has spread through the club', () => {
    renderPage()
    expect(screen.getByText(/2 joueurs sur 3 ont déjà ouvert l'application\./)).toBeInTheDocument()
  })

  // The count answers "how much of the club has arrived", which half a typed
  // name has no business changing — the rows below it narrow, the tally does not.
  it('leaves the count alone while the list is being searched', async () => {
    const user = renderPage()
    await user.type(screen.getByPlaceholderText(/Rechercher par nom/i), 'Szulc')

    expect(screen.getByRole('row', { name: /Joris Szulc/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Enzo Lotz/ })).not.toBeInTheDocument()
    expect(screen.getByText(/2 joueurs sur 3 ont déjà ouvert l'application\./)).toBeInTheDocument()
  })

  // Archived members are out by the default filter, and that is the point: the
  // club is not waiting on someone who has left it.
  it('follows the status filter, so archived members join the tally only under Tous', async () => {
    const user = renderPage()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Statut' }), 'all')

    expect(screen.getByText(/2 joueurs sur 4 ont déjà ouvert l'application\./)).toBeInTheDocument()
  })

  // The state the club is in on the day it is given the link.
  it('stays singular when nobody has opened it yet', async () => {
    const user = renderPage()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Statut' }), 'archived')

    expect(screen.getByText(/0 joueur sur 1 a déjà ouvert l'application\./)).toBeInTheDocument()
  })

  it('flags the members who have never opened it on the mobile cards', () => {
    renderPage()
    const flagged = screen.getAllByText('Jamais connecté')
    expect(flagged).toHaveLength(1)
    // The card of the one member who has never signed in, not a stray badge.
    expect(flagged[0].closest('li')?.textContent).toContain('Enzo Lotz')
  })
})

describe('Joueurs — last visit is not shown to a member who does not administer (#406)', () => {
  it('drops the column, the badges and the tally for a player', () => {
    auth.role = 'player'
    renderPage()

    expect(screen.queryByRole('columnheader', { name: 'Dernière visite' })).not.toBeInTheDocument()
    expect(screen.queryByText('Jamais connecté')).not.toBeInTheDocument()
    expect(screen.queryByText(/ont déjà ouvert l'application/)).not.toBeInTheDocument()
  })
})
