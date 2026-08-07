import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, Player } from '@/types'
import { PlayersPage } from './PlayersPage'

// #315 made users.email nullable, but the modal still refused to save without
// one — so a member's address could be typed in and never taken back out.
// These tests pin the form to the column: an empty e-mail is a valid state, and
// clearing one has to reach the API as an explicit key so PATCH sees it.

const data = vi.hoisted(() => ({ updatePlayer: vi.fn(), addPlayer: vi.fn() }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({
    token: null,
    logout: vi.fn(),
    user: { id: 'u1', email: 'admin@club.fr', role: 'club_admin', isPlayer: false, clubId: 'club-1' },
  }),
}))

const club: Club = {
  id: 'club-1', affiliationNumber: '06680011', displayName: 'PPA Rixheim',
  isArchived: false, addresses: [], channels: [],
}
const withEmail: Player = {
  id: 'p1', firstName: 'Christophe', lastName: 'Hueber', licenseNumber: '686956',
  email: 'christophe@example.fr', phone: '0600000000', status: 'active', clubId: 'club-1',
}
const withoutEmail: Player = {
  id: 'p2', firstName: 'Gilles', lastName: 'Knobloch', licenseNumber: '681234',
  phone: '0611111111', status: 'active', clubId: 'club-1',
}

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    players: [withEmail, withoutEmail],
    clubs: [club],
    updatePlayer: data.updatePlayer,
    addPlayer: data.addPlayer,
  }),
}))

/** Opens the edit modal of one row and returns the dialog. */
async function openEditor(name: string) {
  const user = userEvent.setup()
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
  const row = screen.getByRole('row', { name: new RegExp(name) })
  await user.click(within(row).getByRole('button', { name: 'Modifier' }))
  return { user, dialog: screen.getByRole('dialog') }
}

beforeEach(() => {
  data.updatePlayer.mockClear()
  data.addPlayer.mockClear()
})

describe('PlayersPage — e-mail is optional (#315)', () => {
  it('saves a cleared e-mail as an empty string, so PATCH sees the column', async () => {
    const { user, dialog } = await openEditor('Christophe Hueber')
    await user.clear(within(dialog).getByLabelText(/^Email/))

    const save = within(dialog).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(data.updatePlayer).toHaveBeenCalledWith('p1', expect.objectContaining({ email: '' }))
    // The key must be present — JSON.stringify drops undefined, and a PATCH
    // without it would leave the old address in place.
    expect('email' in data.updatePlayer.mock.calls[0][1]).toBe(true)
  })

  it('lets a member with no e-mail be edited at all', async () => {
    const { user, dialog } = await openEditor('Gilles Knobloch')
    expect(within(dialog).getByLabelText(/^Email/)).toHaveValue('')

    await user.clear(within(dialog).getByLabelText('Téléphone'))
    await user.type(within(dialog).getByLabelText('Téléphone'), '0622222222')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(data.updatePlayer).toHaveBeenCalledWith(
      'p2',
      expect.objectContaining({ email: '', phone: '0622222222' }),
    )
  })

  it('still requires a first and last name', async () => {
    const { user, dialog } = await openEditor('Christophe Hueber')
    await user.clear(within(dialog).getByLabelText('Prénom'))
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('creates a player without an e-mail', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PlayersPage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Ajouter un joueur' }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Prénom'), 'Enzo')
    await user.type(within(dialog).getByLabelText('Nom'), 'Lotz')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(data.addPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Enzo', lastName: 'Lotz', email: '', clubId: 'club-1' }),
    )
  })

  it('trims an address rather than storing the whitespace', async () => {
    const { user, dialog } = await openEditor('Gilles Knobloch')
    await user.type(within(dialog).getByLabelText(/^Email/), '  gilles@example.fr  ')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(data.updatePlayer).toHaveBeenCalledWith(
      'p2',
      expect.objectContaining({ email: 'gilles@example.fr' }),
    )
  })
})
