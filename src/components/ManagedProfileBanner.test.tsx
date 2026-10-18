import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ManagedProfileBanner } from './ManagedProfileBanner'
import type { Profile } from '@/types'

// #749 — on a profile somebody delegated to them, the person is told whose it
// is on every page, and goes back in one click.

const switchProfile = vi.fn().mockResolvedValue(undefined)
const navigate = vi.fn()
const auth = { user: { id: 'chloe' }, profiles: [] as Profile[] }

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...auth, token: null, switchProfile }) }))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => ({ players: [], users: [] }) }))

const nathan: Profile = { id: 'nathan', role: 'club_admin', firstName: 'Nathan', lastName: 'Thomas', clubId: 'r', signedIn: true }
const chloe: Profile = { id: 'chloe', role: 'player', firstName: 'Chloé', lastName: 'Bernard', clubId: 'r', managed: true }

const renderBanner = () => render(<MemoryRouter><ManagedProfileBanner /></MemoryRouter>)

beforeEach(() => vi.clearAllMocks())

describe('ManagedProfileBanner (#749)', () => {
  it('says whose profile is open, and goes back to the one that signed in', async () => {
    auth.user = { id: 'chloe' }
    auth.profiles = [chloe, nathan]
    renderBanner()
    expect(screen.getByTestId('managed-profile-banner')).toHaveTextContent('Chloé Bernard')
    fireEvent.click(screen.getByRole('button', { name: /Revenir à mon profil/ }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(switchProfile).toHaveBeenCalledWith('nathan')
  })

  it('is nothing on one’s own profile', () => {
    auth.user = { id: 'nathan' }
    auth.profiles = [nathan, chloe]
    renderBanner()
    expect(screen.queryByTestId('managed-profile-banner')).toBeNull()
  })
})
