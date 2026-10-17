import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileList } from './ProfileSwitcher'

// #640 — the switcher, a tap on another profile switching to it. #749 — the
// person's own clubs as one list, a row per club, the current one ticked; the
// profiles delegated to them as another, a row per person.

const switchProfile = vi.fn().mockResolvedValue(undefined)
const navigate = vi.fn()

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'benjamin', role: 'club_admin', isPlayer: false },
    token: null,
    switchProfile,
    profiles: [
      { id: 'benjamin', role: 'club_admin', firstName: 'Benjamin', lastName: 'Henaut', clubId: 'a', clubName: 'PPA Rixheim', signedIn: true },
      { id: 'benjamin-ga', role: 'general_admin', firstName: 'Benjamin', lastName: 'Henaut' },
      { id: 'benjamin-b', role: 'player', firstName: 'Benjamin', lastName: 'Henaut', clubId: 'b', clubName: 'CSS Bergheim' },
      { id: 'sacha', role: 'player', firstName: 'Sacha', lastName: 'Henaut', clubId: 'a', clubName: 'PPA Rixheim', managed: true },
    ],
  }),
}))

vi.mock('@/contexts/DataContext', () => ({ useAppData: () => ({ players: [], users: [], clubs: [] }) }))

function renderList() {
  return render(<MemoryRouter><ProfileList /></MemoryRouter>)
}

describe('ProfileList (#640, #749)', () => {
  it('lists the person’s clubs by club, then the profiles they manage by name', () => {
    renderList()
    const [mine, managed] = screen.getAllByRole('heading', { level: 3 })
    expect(mine).toHaveTextContent('Mes clubs')
    expect(managed).toHaveTextContent('Profils que vous gérez')
    const own = within(mine.parentElement!).getAllByRole('button').map((b) => b.textContent)
    expect(own[0]).toContain('CSS Bergheim')
    expect(own[1]).toContain('PPA Rixheim')
    expect(own[2]).toContain('Administration générale')
    // The own rows name the club, not the person — it is the same person.
    expect(within(mine.parentElement!).queryByText('Benjamin Henaut')).toBeNull()
    const sacha = within(managed.parentElement!).getByRole('button')
    expect(sacha).toHaveTextContent('Sacha Henaut')
    expect(sacha).toHaveTextContent('PPA Rixheim · Joueur')
  })

  it('ticks the signed-in profile and does not offer it', () => {
    renderList()
    const current = screen.getByText('PPA Rixheim').closest('button')!
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
    fireEvent.click(screen.getByText('CSS Bergheim').closest('button')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de changer de profil')
  })
})
