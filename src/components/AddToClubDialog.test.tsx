import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Club, Federation, Player } from '@/types'
import { AddToClubDialog } from './AddToClubDialog'

// #644 — Gilles, at Rixheim for the FFTT, joins Landser for the AGR. The rule
// for who may is in src/lib/linkedProfiles.spec.ts and the copy in the API's
// suite; here, what the dialog asks and what it sends.

const federations: Federation[] = [
  { id: 'fftt', displayName: 'Fédération française de tennis de table', shortName: 'FFTT', isImported: true, sortOrder: 0 },
  { id: 'agr', displayName: 'AGR Tennis de table — Section du Haut-Rhin', shortName: 'AGR', isImported: false, sortOrder: 1 },
]
const landser: Club = {
  id: 'club-agr-680036', affiliationNumber: '', displayName: 'Landser ASL', isArchived: false,
  addresses: [], channels: [], affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }],
}
const gilles: Player = {
  id: 'p-gilles', firstName: 'Gilles', lastName: 'Knobloch', licenseNumber: '6810333',
  email: 'gilles@club.fr', phone: '', status: 'active', clubId: 'club-fftt-06680011',
}

const data = vi.hoisted(() => ({
  addProfileInClub: vi.fn(),
  federations: [] as Federation[],
}))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => data }))

beforeEach(() => {
  data.federations = federations
  data.addProfileInClub.mockReset()
})

const renderDialog = (player: Player = gilles) => render(
  <MemoryRouter initialEntries={['/joueurs/p-gilles']}>
    <Routes>
      <Route path="/joueurs/p-gilles" element={<AddToClubDialog player={player} clubs={[landser]} onClose={() => {}} />} />
      <Route path="/joueurs/:id" element={<p>Fiche ouverte</p>} />
    </Routes>
  </MemoryRouter>,
)

describe('AddToClubDialog', () => {
  it("asks for the receiving club's licences only, and opens the new profile", async () => {
    data.addProfileInClub.mockResolvedValue({ ok: true, id: 'p-new' })
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByLabelText('N° licence FFTT')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('N° licence AGR'), ' 1251178 ')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(data.addProfileInClub).toHaveBeenCalledWith('p-gilles', {
      clubId: 'club-agr-680036', licenseNumber: '', licences: [{ federationId: 'agr', number: '1251178' }],
    })
    expect(await screen.findByText('Fiche ouverte')).toBeInTheDocument()
  })

  it('says the API refusal, with a way to the profile already there', async () => {
    data.addProfileInClub.mockResolvedValue({ ok: false, message: 'Ce licencié a déjà un profil dans ce club.', id: 'p-old' })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ce licencié a déjà un profil dans ce club.')
    await user.click(screen.getByRole('button', { name: 'Voir ce profil' }))
    expect(screen.getByText('Fiche ouverte')).toBeInTheDocument()
  })

  it('warns that a licensee without an address will not be linked', () => {
    renderDialog({ ...gilles, email: undefined })
    expect(screen.getByText(/ne seront pas reliés/)).toBeInTheDocument()
  })
})
