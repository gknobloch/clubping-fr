import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Club, Phase, Player, User } from '@/types'
import { ImportPlayersModal } from './ImportPlayersModal'

// ---------------------------------------------------------------------------
// Un homonyme déjà au club (#566)
//
// A club held Nathan Santoro twice: once under 681243, a number that was simply
// wrong, and once created by this very import under FFTT's 6810333. The review
// had everything it needed to ask — `findImportCandidate` has existed since
// #474 — and asked nothing, because both screens passed it an empty candidate
// list and it only ever offered members holding no licence at all.
//
// What is under test here is the screen: that the question is put, that
// declining still creates, and that accepting corrects the member instead.
// What an import *writes* is `playerImportWrites`, tested with the rest of the
// rule in src/lib/ffttPlayers.spec.ts.
// ---------------------------------------------------------------------------

const data = vi.hoisted(() => ({
  addPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  setPlayerPhasePoints: vi.fn(),
  setPlayerSeasonCategories: vi.fn(),
  setClubSeasonLicences: vi.fn(),
  users: [] as User[],
  players: [] as Player[],
}))

const club: Club = {
  id: 'c1', affiliationNumber: '06680011', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const phase = {
  id: 'ph1', seasonId: 's1', name: 'Phase 1', displayName: '2026/2027 Phase 1',
  status: 'active',
} as Phase

vi.mock('@/contexts/DataContext', () => ({
  nextId: () => 'p-new',
  useAppData: () => ({
    clubs: [club],
    phases: [phase],
    players: data.players,
    users: data.users,
    playerPhasePoints: [],
    playerSeasonCategories: [],
    addPlayer: data.addPlayer,
    updatePlayer: data.updatePlayer,
    setPlayerPhasePoints: data.setPlayerPhasePoints,
    setPlayerSeasonCategories: data.setPlayerSeasonCategories,
    setClubSeasonLicences: data.setClubSeasonLicences,
  }),
}))

/** One record of the real xml_licence_b.php?club=… answer. */
const listing = (licence: string, nom: string, prenom: string) =>
  `<liste><licence><idlicence>1</idlicence><licence>${licence}</licence>`
  + `<nom>${nom}</nom><prenom>${prenom}</prenom><numclub>06680011</numclub>`
  + `<nomclub>RIXHEIM PPA</nomclub><point>1788</point><cat>S</cat></licence></liste>`

const member = (over: Partial<User> = {}): User => ({
  id: 'p-old', role: 'player', isPlayer: true,
  firstName: 'Nathan', lastName: 'Santoro', licenseNumber: '681243', clubId: 'c1',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  data.users = []
  data.players = []
  global.fetch = vi.fn(async () => ({
    ok: true, text: async () => listing('6810333', 'SANTORO', 'Nathan'),
  })) as never
})

/** Open the modal and load the club's licence list, as an admin does. */
const loadClub = async () => {
  const user = userEvent.setup()
  render(<ImportPlayersModal clubId="c1" onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /Charger tous les licenciés/ }))
  await screen.findByRole('button', { name: /Importer la sélection/ })
  return user
}

const linkButton = () => screen.queryByRole('button', { name: /c’est la même/ })

describe('ImportPlayersModal — un homonyme sous une autre licence (#566)', () => {
  it('asks instead of silently creating a second Nathan Santoro', async () => {
    data.users = [member()]
    await loadClub()
    expect(linkButton()).not.toBeNull()
    // The question names the number we hold, which is the thing that is wrong.
    expect(screen.getByText(/681243/)).toBeTruthy()
  })

  it('creates a licensee while the match is left unconfirmed', async () => {
    data.users = [member()]
    const user = await loadClub()
    await user.click(screen.getByRole('button', { name: /Importer la sélection/ }))
    expect(data.addPlayer).toHaveBeenCalledTimes(1)
    expect(data.updatePlayer).not.toHaveBeenCalled()
  })

  it('corrects the member once confirmed, licence number and all', async () => {
    data.users = [member()]
    const user = await loadClub()
    await user.click(linkButton()!)
    await user.click(screen.getByRole('button', { name: /Importer la sélection/ }))
    expect(data.addPlayer).not.toHaveBeenCalled()
    expect(data.updatePlayer).toHaveBeenCalledWith('p-old', { licenseNumber: '6810333' })
    // The points and the category land on the member, not on a new row.
    expect(data.setPlayerPhasePoints).toHaveBeenCalledWith([
      { phaseId: 'ph1', playerId: 'p-old', points: '1788' },
    ])
  })

  it('goes back to creating when the rattachement is withdrawn', async () => {
    data.users = [member()]
    const user = await loadClub()
    await user.click(linkButton()!)
    await user.click(screen.getByRole('button', { name: /Annuler/ }))
    await user.click(screen.getByRole('button', { name: /Importer la sélection/ }))
    expect(data.addPlayer).toHaveBeenCalledTimes(1)
  })

  // Archived is where the real duplicate was found, and skipping the archive is
  // how the club came to hold the same licensee twice.
  it('offers an archived namesake, and says they are archived', async () => {
    data.users = [member({ status: 'archived' })]
    await loadClub()
    expect(linkButton()).not.toBeNull()
    expect(screen.getByText(/archivé/)).toBeTruthy()
  })

  // #474's own case, which never once ran in production: a club admin with no
  // licence of their own.
  it('still offers a namesake holding no licence at all (#474)', async () => {
    data.users = [member({ id: 'u-admin', role: 'club_admin', isPlayer: false, licenseNumber: undefined })]
    await loadClub()
    expect(linkButton()).not.toBeNull()
    expect(screen.getByText(/sans numéro de licence/)).toBeTruthy()
  })

  it('never offers a namesake belonging to another club', async () => {
    data.users = [member({ clubId: 'c2' })]
    await loadClub()
    expect(linkButton()).toBeNull()
  })

  // Two namesakes in one club is a question this cannot answer, and answering
  // it wrongly fuses two members permanently.
  it('asks nothing when two members share the name', async () => {
    data.users = [member(), member({ id: 'p-old-2', licenseNumber: '681244' })]
    await loadClub()
    expect(linkButton()).toBeNull()
  })
})
