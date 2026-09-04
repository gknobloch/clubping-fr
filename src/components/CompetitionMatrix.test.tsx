import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Competition, CompetitionEligibility, Player } from '@/types'
import { CompetitionMatrix } from './CompetitionMatrix'

// #482 — the desktop grid. The rule itself is tested in
// src/lib/competitionEligibility.spec.ts; what matters here is that the grid
// renders one verdict per (player, competition) pair, offers the action that
// matches the state, and never offers a way into a locked competition.

const CLUB = 'club-1'

const player = (id: string, first: string, last: string, category?: string): Player => ({
  id, firstName: first, lastName: last, licenseNumber: '1', phone: '',
  status: 'active', clubId: CLUB, ...(category ? { category } : {}),
})

const youth: Competition = {
  id: 'comp-jeunes', displayName: 'Championnat jeunes',
  categories: ['B', 'M', 'C', 'J'], isCategoryLocked: true, sortOrder: 1, isArchived: false,
}
const seniors: Competition = {
  id: 'comp-seniors', displayName: 'Championnat seniors',
  categories: ['S'], isCategoryLocked: false, sortOrder: 2, isArchived: false,
}

const CADET = player('p-cadet', 'Samuel', 'Canemolla', 'C1')
const SENIOR = player('p-senior', 'Joris', 'Szulc', 'S')
const UNKNOWN = player('p-unknown', 'Alex', 'Nemo')

const onSet = vi.fn()

function setup(overrides: CompetitionEligibility[] = [], canManage = true, players = [CADET, SENIOR, UNKNOWN]) {
  return render(
    <CompetitionMatrix
      players={players}
      competitions={[youth, seniors]}
      overrides={overrides}
      canManage={canManage}
      onSet={onSet}
    />,
  )
}

/** The cell button for one (player, competition) pair, found by its row. */
function cell(playerName: string, competition: string) {
  const row = screen.getByText(playerName).closest('tr')!
  return within(row).getByRole('button', { name: new RegExp(competition) })
}

beforeEach(() => {
  onSet.mockReset().mockResolvedValue(undefined)
})

describe('CompetitionMatrix', () => {
  it('shows one column per competition, saying which are reserved', () => {
    setup()
    const header = screen.getByText('Championnat jeunes').closest('th')!
    expect(within(header).getByText('Réservée')).toBeInTheDocument()
    const open = screen.getByText('Championnat seniors').closest('th')!
    expect(within(open).getByText('Ouverte')).toBeInTheDocument()
  })

  it('names each cell with the player, the competition and the reason', () => {
    setup()
    expect(cell('Samuel Canemolla', 'Championnat jeunes')).toHaveAccessibleName(
      /Samuel Canemolla — Championnat jeunes : Par sa catégorie/,
    )
    expect(cell('Samuel Canemolla', 'Championnat seniors')).toHaveAccessibleName(
      /Hors catégorie/,
    )
  })

  it('flags a player who holds no category at all', () => {
    setup()
    expect(cell('Alex Nemo', 'Championnat seniors')).toHaveAccessibleName(/Sans catégorie/)
    expect(screen.getAllByText('Catégorie inconnue')).toHaveLength(1)
  })

  it('excludes an eligible player, and offers to reset afterwards', async () => {
    const user = userEvent.setup()
    setup()
    const button = cell('Joris Szulc', 'Championnat seniors')
    expect(button).toHaveAccessibleName(/Exclure/)
    await user.click(button)
    expect(onSet).toHaveBeenCalledWith('comp-seniors', 'p-senior', 'excluded')

    setup([{ clubId: CLUB, competitionId: 'comp-seniors', playerId: 'p-senior', effect: 'excluded' }])
    expect(screen.getAllByRole('button', { name: /Joris Szulc — Championnat seniors/ })[1])
      .toHaveAccessibleName(/Exclu par le club — Rétablir le défaut/)
  })

  it('adds a player the default mapping would not admit, on an open competition', async () => {
    const user = userEvent.setup()
    setup()
    const button = cell('Samuel Canemolla', 'Championnat seniors')
    expect(button).toHaveAccessibleName(/Ajouter/)
    await user.click(button)
    expect(onSet).toHaveBeenCalledWith('comp-seniors', 'p-cadet', 'included')
  })

  it('never offers a way into a locked competition', async () => {
    const user = userEvent.setup()
    setup()
    const button = cell('Joris Szulc', 'Championnat jeunes')
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleName(/Hors catégorie/)
    expect(button).not.toHaveAccessibleName(/Ajouter/)
    await user.click(button)
    expect(onSet).not.toHaveBeenCalled()
  })

  it('still lets the club exclude from a locked competition', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(cell('Samuel Canemolla', 'Championnat jeunes'))
    expect(onSet).toHaveBeenCalledWith('comp-jeunes', 'p-cadet', 'excluded')
  })

  it('is read-only for a member who does not administer the club', async () => {
    const user = userEvent.setup()
    setup([], false)
    const button = cell('Joris Szulc', 'Championnat seniors')
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleName(/Par sa catégorie$/)
    await user.click(button)
    expect(onSet).not.toHaveBeenCalled()
  })

  it('honours an override the club made, marking it apart from the default', () => {
    setup([{ clubId: CLUB, competitionId: 'comp-seniors', playerId: 'p-cadet', effect: 'included' }])
    expect(cell('Samuel Canemolla', 'Championnat seniors')).toHaveAccessibleName(/Ajouté par le club/)
  })

  it('searches only past the threshold, and says when nothing matches', async () => {
    const user = userEvent.setup()
    setup()
    expect(screen.queryByLabelText('Rechercher un joueur')).not.toBeInTheDocument()

    const many = Array.from({ length: 12 }, (_, i) => player(`p-${i}`, `Prenom${i}`, `Nom${i}`, 'S'))
    setup([], true, many)
    const search = screen.getByLabelText('Rechercher un joueur')
    await user.type(search, 'Nom3')
    expect(screen.getByText('Prenom3 Nom3')).toBeInTheDocument()
    expect(screen.queryByText('Prenom4 Nom4')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'zzz')
    expect(screen.getByText(/Aucun joueur ne correspond/)).toBeInTheDocument()
  })

  it('says so when the club has no active licensee', () => {
    setup([], true, [])
    expect(screen.getByText('Aucun licencié actif dans ce club.')).toBeInTheDocument()
  })
})
