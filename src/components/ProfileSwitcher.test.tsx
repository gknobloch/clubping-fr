import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileList } from './ProfileSwitcher'

// #640 — the switcher: the address's profiles by club, the current one
// marked and inert, and a tap on another switching to it.

const switchProfile = vi.fn().mockResolvedValue(undefined)
const navigate = vi.fn()

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'benjamin', role: 'club_admin', isPlayer: false },
    switchProfile,
    profiles: [
      { id: 'benjamin', role: 'club_admin', firstName: 'Benjamin', lastName: 'Henaut', clubId: 'a', clubName: 'PPA Rixheim' },
      { id: 'sacha', role: 'player', firstName: 'Sacha', lastName: 'Henaut', clubId: 'a', clubName: 'PPA Rixheim' },
      { id: 'lou', role: 'player', firstName: 'Lou', lastName: 'Henaut', clubId: 'b', clubName: 'CSS Bergheim' },
    ],
  }),
}))

vi.mock('@/contexts/DataContext', () => ({ useAppData: () => ({ players: [] }) }))

function renderList() {
  return render(<MemoryRouter><ProfileList /></MemoryRouter>)
}

describe('ProfileList (#640)', () => {
  it('groups the profiles by club', () => {
    renderList()
    const [bergheim, rixheim] = screen.getAllByRole('heading', { level: 3 })
    expect(bergheim).toHaveTextContent('CSS Bergheim')
    expect(rixheim).toHaveTextContent('PPA Rixheim')
    const rixheimList = rixheim.parentElement!
    expect(within(rixheimList).getByText('Benjamin Henaut')).toBeInTheDocument()
    expect(within(rixheimList).getByText('Sacha Henaut')).toBeInTheDocument()
  })

  it('marks the signed-in profile and does not offer it', () => {
    renderList()
    const current = screen.getByText('Benjamin Henaut').closest('button')!
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current).toBeDisabled()
    expect(within(current).getByText('Profil actuel')).toBeInTheDocument()
  })

  it('switches on a tap and lands on the Accueil', async () => {
    renderList()
    fireEvent.click(screen.getByText('Sacha Henaut').closest('button')!)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(switchProfile).toHaveBeenCalledWith('sacha')
  })

  it('says so when the switch fails', async () => {
    switchProfile.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderList()
    fireEvent.click(screen.getByText('Lou Henaut').closest('button')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de changer de profil')
  })
})
