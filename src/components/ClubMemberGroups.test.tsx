import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { MemberGroup, User } from '@/types'
import { ClubMemberGroups } from './ClubMemberGroups'

// #602 — the club's groups, on the club's own page. The write rules live in
// the API's suite; here, the screen: who is offered the controls, and that a
// save never drops somebody the checklist did not show.

const CLUB = 'club-1'

const data = vi.hoisted(() => ({
  users: [] as User[],
  memberGroups: [] as MemberGroup[],
  addMemberGroup: vi.fn(),
  renameMemberGroup: vi.fn(),
  deleteMemberGroup: vi.fn(),
  setMemberGroupMembers: vi.fn(),
  // Competitions reserved to a group (#604) — none unless a test says so.
  competitions: [] as Array<{ id: string; displayName: string }>,
  competitionGroups: [] as Array<{ clubId: string; competitionId: string; groupId: string }>,
}))
const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: false,
  useAuth: () => ({ user: auth.user, token: null, logout: vi.fn() }),
}))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => data }))

const member = (id: string, first: string, last: string, over: Partial<User> = {}): User => ({
  id, role: 'player', isPlayer: true, clubId: CLUB, firstName: first, lastName: last,
  status: 'active', ...over,
})

const clubAdmin = { id: 'ca', role: 'club_admin', clubId: CLUB, isPlayer: false }
const aPlayer = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }

beforeEach(() => {
  data.users = [
    member('p1', 'Quentin', 'Colle'),
    member('p2', 'Enzo', 'Lotz'),
    member('p3', 'Ancien', 'Membre', { status: 'archived' }),
    member('ca', 'Virginie', 'Barlinge', { role: 'club_admin', isPlayer: false }),
    member('far', 'Autre', 'Club', { clubId: 'club-2' }),
  ]
  data.memberGroups = [
    { id: 'g-jeunes', clubId: CLUB, displayName: 'Jeunes', memberIds: ['p2'] },
    { id: 'g-bureau', clubId: CLUB, displayName: 'Bureau', memberIds: ['p1', 'ca', 'p3'] },
    { id: 'g-far', clubId: 'club-2', displayName: 'Arbitres', memberIds: ['far'] },
  ]
  data.addMemberGroup.mockReset().mockResolvedValue({ ok: true })
  data.renameMemberGroup.mockReset().mockResolvedValue({ ok: true })
  data.deleteMemberGroup.mockReset()
  data.setMemberGroupMembers.mockReset()
})

const renderSection = () =>
  render(<MemoryRouter><ClubMemberGroups clubId={CLUB} /></MemoryRouter>)

describe('reading the club\'s groups', () => {
  it('lists this club\'s groups alphabetically, each linking to its members', () => {
    auth.user = aPlayer
    renderSection()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Bureau3 membres', 'Jeunes1 membre'])
    expect(links[0]).toHaveAttribute('href', '/joueurs?groupes=g-bureau')
    expect(screen.queryByText('Arbitres')).not.toBeInTheDocument()
  })

  it('gives a player no way to change them', () => {
    auth.user = aPlayer
    renderSection()
    expect(screen.queryByRole('button', { name: '+ Nouveau groupe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument()
  })

  it('shows a player nothing at all when the club has no group', () => {
    auth.user = aPlayer
    data.memberGroups = []
    const { container } = renderSection()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an admin the empty section, so there is somewhere to start', () => {
    auth.user = clubAdmin
    data.memberGroups = []
    renderSection()
    expect(screen.getByText('Aucun groupe.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nouveau groupe' })).toBeInTheDocument()
  })
})

describe('managing them', () => {
  /** The rows of the editor: the captain's toggle buttons, by name. */
  const rows = (dialog: HTMLElement) =>
    within(dialog).getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))

  it('creates a group with its members in one go', async () => {
    auth.user = clubAdmin
    data.addMemberGroup.mockResolvedValueOnce({
      ok: true, group: { id: 'g-new', clubId: CLUB, displayName: 'Loisirs', memberIds: [] },
    })
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: '+ Nouveau groupe' }))
    const dialog = screen.getByRole('dialog', { name: /Nouveau groupe/ })
    // Enregistrer waits for a name.
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Nom'), 'Loisirs')
    await user.click(within(dialog).getByRole('button', { name: /Enzo Lotz/ }))
    // Counted in the title, like the captain's « (2/4) ».
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Nouveau groupe (1)')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(data.addMemberGroup).toHaveBeenCalledWith(CLUB, 'Loisirs')
    expect(data.setMemberGroupMembers).toHaveBeenCalledWith(CLUB, 'g-new', ['p2'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the editor open on a name the club already uses, having written nothing', async () => {
    auth.user = clubAdmin
    data.addMemberGroup.mockResolvedValueOnce({ ok: false, message: 'Le club a déjà un groupe de ce nom.' })
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: '+ Nouveau groupe' }))
    const dialog = screen.getByRole('dialog', { name: /Nouveau groupe/ })
    await user.type(within(dialog).getByLabelText('Nom'), 'bureau')
    await user.click(within(dialog).getByRole('button', { name: /Enzo Lotz/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Le club a déjà un groupe de ce nom.')
    expect(data.setMemberGroupMembers).not.toHaveBeenCalled()
  })

  it('files members from the whole club, non-licensees included', async () => {
    auth.user = clubAdmin
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[0])
    const dialog = screen.getByRole('dialog', { name: /Modifier le groupe/ })
    // The archived member is offered because they are still in the group.
    expect(rows(dialog)).toHaveLength(4)
    expect(rows(dialog).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(3)
    expect(within(dialog).getByText('Non licencié')).toBeInTheDocument()
    expect(within(dialog).queryByText('Autre Club')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Enzo Lotz/ }))
    await user.click(within(dialog).getByRole('button', { name: /Ancien Membre/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    // The name did not move, so only the members are written.
    expect(data.renameMemberGroup).not.toHaveBeenCalled()
    expect(data.setMemberGroupMembers).toHaveBeenCalledWith(CLUB, 'g-bureau', ['ca', 'p1', 'p2'])
  })

  it('renames without touching the members when none moved', async () => {
    auth.user = clubAdmin
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[1])
    const dialog = screen.getByRole('dialog', { name: /Modifier le groupe/ })
    await user.clear(within(dialog).getByLabelText('Nom'))
    await user.type(within(dialog).getByLabelText('Nom'), 'Cadets')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(data.renameMemberGroup).toHaveBeenCalledWith(CLUB, 'g-jeunes', 'Cadets')
    expect(data.setMemberGroupMembers).not.toHaveBeenCalled()
  })

  it('does not offer an archived member who is not already in the group', async () => {
    auth.user = clubAdmin
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[1])
    const dialog = screen.getByRole('dialog', { name: /Modifier le groupe/ })
    expect(within(dialog).queryByText(/Ancien Membre/)).not.toBeInTheDocument()
  })

  it('asks before deleting, and says nobody leaves the club', async () => {
    auth.user = clubAdmin
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[1])
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Ses membres restent au club')
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    expect(data.deleteMemberGroup).toHaveBeenCalledWith(CLUB, 'g-jeunes')
  })
})
