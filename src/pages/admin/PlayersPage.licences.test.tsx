import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, Federation, Player } from '@/types'
import { PlayersPage } from './PlayersPage'

// #644 — a licence box per federation of the member's club. Landser plays the
// AGR alone, so its form asks for an AGR licence and no FFTT one; Kembs plays
// both and asks for both.

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({
    token: null, logout: vi.fn(),
    user: { id: 'ga', email: 'ga@club.fr', role: 'general_admin', isPlayer: false },
  }),
}))

const federations: Federation[] = [
  { id: 'fftt', displayName: 'Fédération française de tennis de table', shortName: 'FFTT', isImported: true, sortOrder: 0 },
  { id: 'agr', displayName: 'AGR Tennis de table — Section du Haut-Rhin', shortName: 'AGR', isImported: false, sortOrder: 1 },
]
const landser: Club = {
  id: 'club-agr-680036', affiliationNumber: '', displayName: 'Landser ASL', isArchived: false,
  addresses: [], channels: [], affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }],
}
const kembs: Club = {
  id: 'club-fftt-06680140', affiliationNumber: '06680140', displayName: 'Kembs TT', isArchived: false,
  addresses: [], channels: [], affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }],
}
const gilles: Player = {
  id: 'p-gilles', firstName: 'Gilles', lastName: 'Knobloch', licenseNumber: '',
  licences: [{ federationId: 'agr', number: '1251178' }],
  phone: '', status: 'active', clubId: landser.id,
}
const both: Player = {
  id: 'p-both', firstName: 'Fabrice', lastName: 'Dangelser', licenseNumber: '6810333',
  licences: [{ federationId: 'agr', number: '1477519' }],
  phone: '', status: 'active', clubId: kembs.id,
}

const data = vi.hoisted(() => ({ updatePlayer: vi.fn(), addPlayer: vi.fn(() => ({ id: 'new' })) }))

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    players: [gilles, both],
    clubs: [landser, kembs],
    federations,
    updatePlayer: data.updatePlayer,
    addPlayer: data.addPlayer,
    seasons: [{ id: '27', displayName: '2026/2027', status: 'active' }],
    playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    setPlayerSeasonCategories: vi.fn(), clearPlayerSeasonCategory: vi.fn(),
  }),
}))

beforeEach(() => {
  cleanup()
  data.updatePlayer.mockReset()
})

const renderPage = () => render(<MemoryRouter><PlayersPage /></MemoryRouter>)

// The card list and the table are both in the DOM; the table's row is the one
// carrying the "Modifier" button.
const editButtonOf = (name: string) =>
  within(screen.getAllByText(name).map((n) => n.closest('tr')).find(Boolean)!).getByRole('button', { name: 'Modifier' })

describe('PlayersPage — a licence per federation (#644)', () => {
  it('tags each licence in the list', () => {
    renderPage()
    const row = screen.getAllByText('Fabrice Dangelser').map((n) => n.closest('tr')).find(Boolean)!
    expect(within(row).getByText('6810333')).toBeInTheDocument()
    expect(within(row).getByText('1477519')).toBeInTheDocument()
    expect(within(row).getByText(/AGR/)).toBeInTheDocument()
  })

  it('asks a Landser licensee for an AGR licence and no FFTT one', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(editButtonOf('Gilles Knobloch'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByLabelText('N° licence FFTT')).not.toBeInTheDocument()
    const agr = within(dialog).getByLabelText('N° licence AGR')
    expect(agr).toHaveValue('1251178')

    await user.clear(agr)
    await user.type(agr, '1251179')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(data.updatePlayer).toHaveBeenCalledWith('p-gilles', expect.objectContaining({
      licences: [{ federationId: 'agr', number: '1251179' }],
    }))
  })

  it('asks a Kembs licensee for both, and sends the FFTT one where it always went', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(editButtonOf('Fabrice Dangelser'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('N° licence FFTT')).toHaveValue('6810333')
    expect(within(dialog).getByLabelText('N° licence AGR')).toHaveValue('1477519')

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(data.updatePlayer).toHaveBeenCalledWith('p-both', expect.objectContaining({
      licenseNumber: '6810333',
      licences: [{ federationId: 'agr', number: '1477519' }],
    }))
  })
})
