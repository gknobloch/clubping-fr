import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Player, User } from '@/types'
import { ClubAdmins } from './ClubAdmins'
import { MAX_CLUB_ADMINS } from '@/lib/clubAdmins'

// #474 — the section that answers "who runs this club". The rules themselves
// live in src/lib/clubAdmins.spec.ts and the writes in the API's own suite;
// what matters here is that the screen obeys them: it does not offer the sixth
// appointment, it does not offer to remove the last admin, and it shows the
// API's refusal rather than inventing one.

const CLUB = 'club-1'

const data = vi.hoisted(() => ({
  addClubAdmin: vi.fn(),
  removeClubAdmin: vi.fn(),
  users: [] as User[],
  players: [] as Player[],
}))
const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: false,
  useAuth: () => ({ user: auth.user, token: null, logout: vi.fn() }),
}))

vi.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    users: data.users,
    players: data.players,
    addClubAdmin: data.addClubAdmin,
    removeClubAdmin: data.removeClubAdmin,
  }),
}))

const admin = (id: string, first: string, last: string, over: Partial<User> = {}): User => ({
  id, role: 'club_admin', isPlayer: true, clubId: CLUB,
  firstName: first, lastName: last, email: `${id}@example.com`, status: 'active', ...over,
})
const player = (id: string, first: string, last: string): Player => ({
  id, firstName: first, lastName: last, licenseNumber: '1', phone: '',
  email: `${id}@example.com`, status: 'active', clubId: CLUB,
})

/** A club with `n` admins and one promotable player, seen by a club admin of it. */
function setup(n: number, extra: { players?: Player[]; users?: User[] } = {}) {
  data.users = [
    ...Array.from({ length: n }, (_, i) => admin(`a${i}`, `Admin${i}`, `Nom${i}`)),
    ...(extra.users ?? []),
  ]
  data.players = extra.players ?? [player('p1', 'Quentin', 'Colle')]
  auth.user = { id: 'a0', role: 'club_admin', clubId: CLUB, isPlayer: false }
  return userEvent.setup()
}

beforeEach(() => {
  data.addClubAdmin.mockReset().mockResolvedValue({ ok: true })
  data.removeClubAdmin.mockReset().mockResolvedValue({ ok: true })
})

describe('the list (#474)', () => {
  it('counts the admins against the cap', () => {
    setup(2)
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.getByText(`2 / ${MAX_CLUB_ADMINS}`)).toBeInTheDocument()
  })

  it('lists this club’s admins and not its players', () => {
    setup(2)
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.getByText('Admin0 Nom0')).toBeInTheDocument()
    expect(screen.getByText('Admin1 Nom1')).toBeInTheDocument()
    expect(screen.queryByText('Quentin Colle')).not.toBeInTheDocument()
  })

  it('leaves out another club’s admins', () => {
    setup(1, { users: [admin('x', 'Ailleurs', 'Autre', { clubId: 'club-2' })] })
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.queryByText('Ailleurs Autre')).not.toBeInTheDocument()
  })

  it('marks the ones who hold no licence', () => {
    setup(1, { users: [admin('s', 'Virginie', 'Barlinge', { isPlayer: false })] })
    render(<ClubAdmins clubId={CLUB} />)
    const row = screen.getByText('Virginie Barlinge').closest('li')!
    expect(within(row).getByText('Non licencié')).toBeInTheDocument()
  })

  it('says so plainly when a club has nobody', () => {
    setup(0)
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.getByText(/Aucun administrateur/)).toBeInTheDocument()
  })
})

describe('appointing (#474)', () => {
  it('promotes a member picked from the club', async () => {
    const user = setup(2)
    render(<ClubAdmins clubId={CLUB} />)
    await user.click(screen.getByRole('button', { name: '+ Désigner un membre' }))
    await user.click(screen.getByRole('button', { name: /Quentin Colle/ }))
    expect(data.addClubAdmin).toHaveBeenCalledWith(CLUB, { userId: 'p1' })
  })

  it('does not offer someone who already administers the club', async () => {
    const user = setup(1, { players: [player('a0', 'Admin0', 'Nom0'), player('p1', 'Quentin', 'Colle')] })
    render(<ClubAdmins clubId={CLUB} />)
    await user.click(screen.getByRole('button', { name: '+ Désigner un membre' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /Admin0 Nom0/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Quentin Colle/ })).toBeInTheDocument()
  })

  it('creates a non-licensee from the invitation form', async () => {
    const user = setup(1)
    render(<ClubAdmins clubId={CLUB} />)
    await user.click(screen.getByRole('button', { name: /Inviter une personne non licenciée/ }))
    await user.type(screen.getByLabelText('Prénom'), 'Virginie')
    await user.type(screen.getByLabelText('Nom'), 'Barlinge')
    await user.type(screen.getByLabelText('Adresse e-mail'), 'v@example.com')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))
    expect(data.addClubAdmin).toHaveBeenCalledWith(CLUB, {
      firstName: 'Virginie', lastName: 'Barlinge', email: 'v@example.com',
    })
  })

  it('will not submit an invitation without a name and an address', async () => {
    const user = setup(1)
    render(<ClubAdmins clubId={CLUB} />)
    await user.click(screen.getByRole('button', { name: /Inviter une personne non licenciée/ }))
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeDisabled()
    await user.type(screen.getByLabelText('Prénom'), 'Virginie')
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeDisabled()
  })

  it(`offers nothing once the club has ${MAX_CLUB_ADMINS}`, () => {
    setup(MAX_CLUB_ADMINS)
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.queryByRole('button', { name: '+ Désigner un membre' })).not.toBeInTheDocument()
    expect(screen.getByText(new RegExp(`maximum de ${MAX_CLUB_ADMINS}`))).toBeInTheDocument()
  })

  // The screen must not paraphrase the server: the refusal it shows is the one
  // the API sent, or the two can disagree.
  it('shows the API’s refusal verbatim', async () => {
    const user = setup(2)
    data.addClubAdmin.mockResolvedValue({ ok: false, message: 'Refus très précis du serveur.' })
    render(<ClubAdmins clubId={CLUB} />)
    await user.click(screen.getByRole('button', { name: '+ Désigner un membre' }))
    await user.click(screen.getByRole('button', { name: /Quentin Colle/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Refus très précis du serveur.')
  })
})

describe('standing down (#474)', () => {
  it('removes an admin once the confirmation is accepted', async () => {
    const user = setup(2)
    render(<ClubAdmins clubId={CLUB} />)
    const row = screen.getByText('Admin1 Nom1').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Retirer' }))
    // The row button and the dialog's confirm share a label, so scope to the dialog.
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }))
    expect(data.removeClubAdmin).toHaveBeenCalledWith(CLUB, 'a1')
  })

  it('refuses the last one without even asking the API', async () => {
    const user = setup(1)
    render(<ClubAdmins clubId={CLUB} />)
    const row = screen.getByText('Admin0 Nom0').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Retirer' }))
    expect(data.removeClubAdmin).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/dernier administrateur/)
  })
})

describe('who sees the controls (#474)', () => {
  it('gives a plain player the list and no buttons', () => {
    setup(2)
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.getByText('Admin0 Nom0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Désigner un membre' })).not.toBeInTheDocument()
  })

  it('gives a club admin of another club no buttons either', () => {
    setup(2)
    auth.user = { id: 'z', role: 'club_admin', clubId: 'club-2', isPlayer: false }
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })

  it('gives a general admin the controls anywhere', () => {
    setup(2)
    auth.user = { id: 'g', role: 'general_admin', isPlayer: false }
    render(<ClubAdmins clubId={CLUB} />)
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(2)
  })
})
