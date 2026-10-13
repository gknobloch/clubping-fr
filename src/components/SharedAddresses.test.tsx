import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { Club, Player, User } from '@/types'
import { SharedAddresses } from './SharedAddresses'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'ga', role: 'general_admin', isPlayer: false } }),
}))

// #655, step 3 — the general admin picks who keeps a shared address.

const club = (id: string, displayName: string): Club =>
  ({ id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [] })

const player = (id: string, personId: string, firstName: string, email?: string, clubId = 'club-a'): Player => ({
  id, personId, firstName, lastName: 'Henaut', email, clubId, licenseNumber: '', phone: '', status: 'active',
})
const asUser = (p: Player, admins: string[] = []): User =>
  ({ ...p, role: admins.includes(p.id) ? 'general_admin' : 'player', isPlayer: !admins.includes(p.id) })

function renderWith(players: Player[], personId?: string, admins: string[] = []) {
  const data = {
    divisions: [], clubs: [club('club-a', 'Rixheim PPA'), club('club-b', 'Landser ASL')], seasons: [], phases: [],
    competitions: [], competitionGroups: [], competitionEligibilities: [], federations: [],
    groups: [], teams: [], players, playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users: players.map((p) => asUser(p, admins)),
  }
  return render(
    <MemoryRouter>
      <DataProvider initialData={data}>
        <SharedAddresses personId={personId} />
      </DataProvider>
    </MemoryRouter>,
  )
}

const family = [
  player('benjamin', 'p-benjamin', 'Benjamin', 'henaut@example.fr'),
  player('sacha', 'p-sacha', 'Sacha', 'Henaut@example.fr'),
  player('sacha-b', 'p-sacha', 'Sacha', 'Henaut@example.fr', 'club-b'),
  player('zoe', 'p-zoe', 'Zoé', 'zoe@example.fr'),
]

describe('SharedAddresses', () => {
  it('lists the people behind one address, with their clubs', () => {
    renderWith(family)
    expect(screen.getByText('henaut@example.fr')).toBeInTheDocument()
    expect(screen.getByText('Rixheim PPA · Landser ASL')).toBeInTheDocument()
    expect(screen.queryByText('Zoé Henaut')).not.toBeInTheDocument()
  })

  it('says what keeping it does, and settles it on confirmation', async () => {
    renderWith(family)
    const benjamin = screen.getByText('Benjamin Henaut').closest('li')!
    await userEvent.click(within(benjamin).getByRole('button', { name: 'Garde l’adresse' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Benjamin Henaut garde henaut@example.fr ?')
    expect(dialog).toHaveTextContent('Sacha Henaut n’aura plus d’adresse, et Benjamin Henaut en devient le délégué')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }))
    // Sacha has no address now, so nothing is shared any more.
    await waitFor(() => expect(screen.queryByText('henaut@example.fr')).not.toBeInTheDocument())
  })

  it('changes nothing when the general admin backs out', async () => {
    renderWith(family)
    const sacha = screen.getByText('Sacha Henaut').closest('li')!
    await userEvent.click(within(sacha).getByRole('button', { name: 'Garde l’adresse' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }))
    expect(screen.getByText('henaut@example.fr')).toBeInTheDocument()
  })

  it('narrows to one person’s address on a fiche, and is nothing without one', () => {
    const { container } = renderWith(family, 'p-zoe')
    expect(container).toBeEmptyDOMElement()
  })

  it('offers to join two people who are one — an admin profile beside its owner’s', async () => {
    const admin: Player = { ...player('ga', 'p-ga', '', 'g@example.fr', ''), firstName: '', lastName: '' }
    const gilles = player('g-rix', 'p-g', 'Gilles', 'G@example.fr')
    renderWith([admin, gilles], undefined, ['ga'])
    expect(screen.getByText('Administration générale')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'C’est la même personne' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('deviennent une seule personne, Gilles Henaut, avec ses 2 profils : Rixheim PPA, Administration générale')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(screen.queryByText('g@example.fr')).not.toBeInTheDocument())
  })

  it('offers no merge for three — which two would be ambiguous', () => {
    renderWith([...family, player('lea', 'p-lea', 'Léa', 'henaut@example.fr')])
    expect(screen.queryByRole('button', { name: 'C’est la même personne' })).not.toBeInTheDocument()
  })
})
