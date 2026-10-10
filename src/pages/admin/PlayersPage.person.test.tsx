import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, Player } from '@/types'
import { PlayersPage } from './PlayersPage'

// #655 — a person's name and coordinates are shared by all their club
// profiles. Rixheim's admin still edits Gilles's Rixheim profile (licence,
// status), but not what Landser reads too.

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({
    token: null, logout: vi.fn(),
    user: { id: 'ca', email: 'ca@club.fr', role: 'club_admin', isPlayer: false, clubId: 'rixheim' },
  }),
}))

const club = (id: string, displayName: string): Club => ({
  id, affiliationNumber: id === 'rixheim' ? '06680011' : '', displayName, isArchived: false, addresses: [], channels: [],
})
const gillesRixheim: Player = {
  id: 'g-rix', personId: 'person-g', firstName: 'Gilles', lastName: 'Knobloch', licenseNumber: '6810333',
  email: 'gilles@club.fr', phone: '0611', status: 'active', clubId: 'rixheim',
}
const gillesLandser: Player = { ...gillesRixheim, id: 'g-lan', clubId: 'landser', licenseNumber: '' }
const sam: Player = {
  id: 'sam', personId: 'person-sam', firstName: 'Sam', lastName: 'Petit', licenseNumber: '9',
  email: 'sam@club.fr', phone: '0622', status: 'active', clubId: 'rixheim',
}

const data = vi.hoisted(() => ({ updatePlayer: vi.fn() }))
vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    players: [gillesRixheim, gillesLandser, sam],
    clubs: [club('rixheim', 'Rixheim PPA'), club('landser', 'Landser ASL')],
    federations: [],
    updatePlayer: data.updatePlayer, addPlayer: vi.fn(),
    seasons: [{ id: '27', displayName: '2026/2027', status: 'active' }],
    playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    setPlayerSeasonCategories: vi.fn(), clearPlayerSeasonCategory: vi.fn(),
  }),
}))

beforeEach(() => {
  cleanup()
  data.updatePlayer.mockReset()
})

const openEdit = async (name: string) => {
  const user = userEvent.setup()
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
  const row = screen.getAllByText(name).map((n) => n.closest('tr')).find(Boolean)!
  await user.click(within(row).getByRole('button', { name: 'Modifier' }))
  return { user, dialog: screen.getByRole('dialog') }
}

describe('PlayersPage — the person behind the profile (#655)', () => {
  it('locks the name and coordinates of someone who also plays elsewhere, and says who may change them', async () => {
    const { user, dialog } = await openEdit('Gilles Knobloch')
    expect(within(dialog).getByText(/Joue aussi à Landser ASL/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Prénom')).toHaveAttribute('readonly')
    expect(within(dialog).getByLabelText('Email (optionnel)')).toHaveAttribute('readonly')
    expect(within(dialog).getByLabelText('N° licence')).not.toHaveAttribute('readonly')

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    const patch = data.updatePlayer.mock.calls[0][1]
    expect(patch).toMatchObject({ licenseNumber: '6810333', status: 'active' })
    expect(patch).not.toHaveProperty('firstName')
    expect(patch).not.toHaveProperty('email')
  })

  it("leaves a one-club licensee entirely to their club, as since #600", async () => {
    const { dialog } = await openEdit('Sam Petit')
    expect(within(dialog).queryByText(/Joue aussi/)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Prénom')).not.toHaveAttribute('readonly')
  })
})
