import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Club, MemberGroup, Player } from '@/types'
import { PlayersPage } from './PlayersPage'

// #602 — anyone in the club narrows the Joueurs list to one or more of its
// groups, in ET or in OU, and the filter survives in the URL.

const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ token: null, logout: vi.fn(), user: auth.user }),
}))

const club: Club = {
  id: 'club-1', affiliationNumber: '06680011', displayName: 'PPA Rixheim',
  isArchived: false, addresses: [], channels: [],
}
const player = (id: string, firstName: string, lastName: string, clubId = 'club-1'): Player => ({
  id, firstName, lastName, licenseNumber: id, phone: '', status: 'active', clubId,
})
const PLAYERS = [
  player('p1', 'Anna', 'Bureau'),
  player('p2', 'Bruno', 'Both'),
  player('p3', 'Chloé', 'Jeune'),
  player('p4', 'David', 'Aucun'),
  player('p9', 'Eve', 'Ailleurs', 'club-2'),
]
const GROUPS: MemberGroup[] = [
  { id: 'g-bureau', clubId: 'club-1', displayName: 'Bureau', memberIds: ['p1', 'p2'] },
  { id: 'g-jeunes', clubId: 'club-1', displayName: 'Jeunes', memberIds: ['p2', 'p3'] },
  { id: 'g-far', clubId: 'club-2', displayName: 'Arbitres', memberIds: ['p9'] },
]

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    players: PLAYERS,
    clubs: [club, { ...club, id: 'club-2', displayName: 'Illzach' }],
    updatePlayer: vi.fn(), addPlayer: vi.fn(),
    seasons: [{ id: '26', displayName: '2025/2026', status: 'active' }],
    playerSeasonCategories: [], playerSeasonLicences: [],
    memberGroups: GROUPS,
    setPlayerSeasonCategories: vi.fn(), clearPlayerSeasonCategory: vi.fn(),
  }),
}))

let search = ''
function Location() {
  search = useLocation().search
  return null
}

function renderAt(url = '/joueurs') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/joueurs" element={<><PlayersPage /><Location /></>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

/** Who the desktop table lists, by last name. */
const listed = () =>
  within(screen.getAllByRole('table')[0])
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent?.split(' ').pop())

beforeEach(() => {
  auth.user = { id: 'p4', role: 'player', isPlayer: true, clubId: 'club-1' }
})

describe('PlayersPage — filtering by group (#602)', () => {
  it('offers a player their own club\'s groups, and no other', () => {
    renderAt()
    const filter = screen.getByRole('group', { name: 'Filtrer par groupe' })
    expect(within(filter).getAllByRole('button').map((b) => b.textContent)).toEqual(['Bureau', 'Jeunes'])
    expect(listed()).toEqual(['Aucun', 'Both', 'Bureau', 'Jeune'])
  })

  it('narrows to one group, and says how many are left', async () => {
    const user = renderAt()
    await user.click(screen.getByRole('button', { name: 'Bureau' }))
    expect(listed()).toEqual(['Both', 'Bureau'])
    expect(screen.getByText('2 joueurs')).toBeInTheDocument()
    expect(search).toBe('?groupes=g-bureau')
  })

  it('combines two groups in OU by default, and in ET on request', async () => {
    const user = renderAt()
    // The switch only appears once it means something.
    await user.click(screen.getByRole('button', { name: 'Bureau' }))
    expect(screen.queryByRole('checkbox', { name: 'Au moins un groupe' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Jeunes' }))

    // Off, and saying what off means.
    const mode = screen.getByRole('checkbox', { name: 'Au moins un groupe' })
    expect(mode).not.toBeChecked()
    expect(listed()).toEqual(['Both', 'Bureau', 'Jeune'])

    await user.click(mode)
    // On, and the label follows.
    expect(screen.getByRole('checkbox', { name: 'Tous les groupes' })).toBeChecked()
    expect(listed()).toEqual(['Both'])
    expect(search).toBe('?groupes=g-bureau%2Cg-jeunes&mode=tous')
  })

  it('opens already filtered from a link, and clears back to the club', async () => {
    const user = renderAt('/joueurs?groupes=g-jeunes')
    expect(screen.getByRole('button', { name: 'Jeunes' })).toHaveAttribute('aria-pressed', 'true')
    expect(listed()).toEqual(['Both', 'Jeune'])

    await user.click(screen.getByRole('button', { name: 'Effacer' }))
    expect(listed()).toEqual(['Aucun', 'Both', 'Bureau', 'Jeune'])
    expect(search).toBe('')
  })

  it('combines with the search box', async () => {
    const user = renderAt('/joueurs?groupes=g-bureau')
    await user.type(screen.getByPlaceholderText('Rechercher un joueur'), 'anna')
    expect(listed()).toEqual(['Bureau'])
  })

  // A general admin sees every club and has no groups of their own, but a
  // group on a club's page links here all the same.
  it('lets a general admin arriving on a group filter by that club\'s groups', () => {
    auth.user = { id: 'ga', role: 'general_admin', isPlayer: false }
    renderAt('/joueurs?groupes=g-far')
    const filter = screen.getByRole('group', { name: 'Filtrer par groupe' })
    expect(within(filter).getAllByRole('button').map((b) => b.textContent)).toEqual(['Arbitres', 'Effacer'])
    expect(screen.getByText('1 joueur')).toBeInTheDocument()
    expect(listed()).toEqual(['Ailleurs'])
  })

  it('shows a general admin no filter otherwise', () => {
    auth.user = { id: 'ga', role: 'general_admin', isPlayer: false }
    renderAt()
    expect(screen.queryByRole('group', { name: 'Filtrer par groupe' })).not.toBeInTheDocument()
  })
})
