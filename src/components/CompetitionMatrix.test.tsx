import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import type { Competition, CompetitionEligibility, Player } from '@/types'
import { CompetitionMatrix, type AssignmentIndex } from './CompetitionMatrix'

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

function setup(
  overrides: CompetitionEligibility[] = [],
  canManage = true,
  players = [CADET, SENIOR, UNKNOWN],
  assignments: AssignmentIndex = new Map(),
) {
  return render(
    <MemoryRouter>
    <CompetitionMatrix
      players={players}
      competitions={[youth, seniors]}
      overrides={overrides}
      assignments={assignments}
      canManage={canManage}
      onSet={onSet}
    />
    </MemoryRouter>,
  )
}

/** An assignment index holding one engagement. */
const engagedIn = (competitionId: string, playerId: string, teamNumbers = [6], lineups = 0) =>
  new Map([[competitionId, new Map([[playerId, { teamNumbers, lineups }]])]]) as AssignmentIndex

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

  it('leads to the player behind each row', () => {
    setup()
    expect(screen.getByRole('link', { name: /Joris Szulc/ }))
      .toHaveAttribute('href', '/joueurs/p-senior')
  })

  // #482 — eligibility never empties a squad, so an exclusion can contradict a
  // team sheet in silence. The grid has to say so, and ask before making it.
  describe('already engaged', () => {
    it('marks a licensee the competition refuses but an équipe still fields', () => {
      setup([], true, undefined, engagedIn('comp-seniors', 'p-cadet', [6], 2))
      expect(cell('Samuel Canemolla', 'Championnat seniors'))
        .toHaveAccessibleName(/Hors catégorie — Déjà dans l'équipe 6 et aligné sur 2 rencontres/)
      // An eligible player is no contradiction, so nothing is flagged.
      expect(cell('Joris Szulc', 'Championnat seniors')).not.toHaveAccessibleName(/Déjà/)
    })

    it('asks before excluding one, and says the exclusion undoes nothing', async () => {
      const user = userEvent.setup()
      setup([], true, undefined, engagedIn('comp-seniors', 'p-senior'))
      await user.click(cell('Joris Szulc', 'Championnat seniors'))

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent("Déjà dans l'équipe 6")
      expect(dialog).toHaveTextContent(/ne le retire d'aucune équipe ni d'aucune composition/)
      expect(onSet).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Exclure' }))
      expect(onSet).toHaveBeenCalledWith('comp-seniors', 'p-senior', 'excluded')
    })

    it('writes nothing when the club backs out', async () => {
      const user = userEvent.setup()
      setup([], true, undefined, engagedIn('comp-seniors', 'p-senior'))
      await user.click(cell('Joris Szulc', 'Championnat seniors'))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }))
      expect(onSet).not.toHaveBeenCalled()
    })

    it('does not ask when there is nothing to contradict', async () => {
      const user = userEvent.setup()
      setup()
      await user.click(cell('Joris Szulc', 'Championnat seniors'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(onSet).toHaveBeenCalledWith('comp-seniors', 'p-senior', 'excluded')
    })
  })

  describe('filtering by category', () => {
    it('offers only the categories the club holds, plus the ones without', () => {
      setup()
      const filter = screen.getByLabelText('Catégorie')
      const options = within(filter).getAllByRole('option').map((o) => o.textContent)
      expect(options).toEqual(['Toutes', 'Cadet', 'Senior', 'Sans catégorie'])
    })

    it('narrows the rows, and says how many of how many', async () => {
      const user = userEvent.setup()
      setup()
      await user.selectOptions(screen.getByLabelText('Catégorie'), 'C')
      expect(screen.getByText('Samuel Canemolla')).toBeInTheDocument()
      expect(screen.queryByText('Joris Szulc')).not.toBeInTheDocument()
      expect(screen.getByText('1 licencié sur 3')).toBeInTheDocument()
    })

    it('picks out the licensees no category is known for', async () => {
      const user = userEvent.setup()
      setup()
      await user.selectOptions(screen.getByLabelText('Catégorie'), 'none')
      expect(screen.getByText('Alex Nemo')).toBeInTheDocument()
      expect(screen.queryByText('Samuel Canemolla')).not.toBeInTheDocument()
    })
  })

  describe('bulk actions', () => {
    it('selects everything the filter shows, and nothing it hides', async () => {
      const user = userEvent.setup()
      setup()
      await user.selectOptions(screen.getByLabelText('Catégorie'), 'C')
      await user.click(screen.getByLabelText('Tout sélectionner'))
      expect(screen.getByText('1 sélectionné')).toBeInTheDocument()
    })

    it('drops from the selection whoever the filter stops showing', async () => {
      const user = userEvent.setup()
      setup()
      await user.click(screen.getByLabelText('Tout sélectionner'))
      expect(screen.getByText('3 sélectionnés')).toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText('Catégorie'), 'C')
      expect(screen.getByText('1 sélectionné')).toBeInTheDocument()
    })

    it('applies one action to the selection, on the competition chosen', async () => {
      const user = userEvent.setup()
      setup()
      await user.click(screen.getByLabelText('Tout sélectionner'))
      await user.selectOptions(screen.getByLabelText('Compétition à modifier'), 'comp-seniors')

      // Only the senior is eligible by default, so only he can be excluded.
      await user.click(screen.getByRole('button', { name: 'Exclure (1)' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exclure' }))

      expect(onSet).toHaveBeenCalledTimes(1)
      expect(onSet).toHaveBeenCalledWith('comp-seniors', 'p-senior', 'excluded')
      expect(screen.getByRole('status')).toHaveTextContent('1 licencié modifié, 2 inchangés.')
    })

    it('counts each action separately, and offers no way into a locked competition', async () => {
      const user = userEvent.setup()
      setup()
      await user.click(screen.getByLabelText('Tout sélectionner'))
      // Youth is locked: the cadet is already in, the other two cannot be added.
      expect(screen.getByRole('button', { name: 'Ajouter (0)' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Exclure (1)' })).toBeEnabled()
    })

    it('warns in the confirmation when the selection is already engaged', async () => {
      const user = userEvent.setup()
      setup([], true, undefined, engagedIn('comp-seniors', 'p-senior'))
      await user.click(screen.getByLabelText('Tout sélectionner'))
      await user.selectOptions(screen.getByLabelText('Compétition à modifier'), 'comp-seniors')
      await user.click(screen.getByRole('button', { name: 'Exclure (1)' }))
      expect(screen.getByRole('dialog')).toHaveTextContent(/1 est déjà engagé dans cette compétition/)
    })

    it('has no selection column at all for a member who cannot manage', () => {
      setup([], false)
      expect(screen.queryByLabelText('Tout sélectionner')).not.toBeInTheDocument()
    })
  })

  it('says so when the club has no active licensee', () => {
    setup([], true, [])
    expect(screen.getByText('Aucun licencié actif dans ce club.')).toBeInTheDocument()
  })

  // #482 — the header carries the filters, so each column narrows on its own
  // terms: a name, a category, or the state of one championship.
  describe('the header row', () => {
    it('gives the category a column of its own, beside the name', () => {
      setup()
      const row = screen.getByText('Samuel Canemolla').closest('tr')!
      const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
      // checkbox, name, category, then one per competition.
      expect(cells[1]).toBe('Samuel Canemolla')
      expect(cells[2]).toBe('Cadet (C1)')
      expect(screen.getByRole('columnheader', { name: /Catégorie/ })).toBeInTheDocument()
    })

    it('puts the name search and the category filter in their own headers', () => {
      const many = Array.from({ length: 12 }, (_, i) => player(`p-${i}`, `Prenom${i}`, `Nom${i}`, 'S'))
      setup([], true, many)
      const nameHeader = screen.getByRole('columnheader', { name: /Joueur/ })
      expect(within(nameHeader).getByLabelText('Rechercher un joueur')).toBeInTheDocument()
      const categoryHeader = screen.getByRole('columnheader', { name: /Catégorie/ })
      expect(within(categoryHeader).getByLabelText('Catégorie')).toBeInTheDocument()
    })
  })

  describe('per-competition status filter', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>, competition: string) => {
      await user.click(screen.getByRole('button', { name: `Filtrer ${competition} par statut` }))
    }

    it('keeps only the rows whose cell holds one of the statuses ticked', async () => {
      const user = userEvent.setup()
      setup()
      await open(user, 'Championnat seniors')
      await user.click(screen.getByRole('checkbox', { name: 'Hors catégorie' }))

      // The cadet is out of the seniors' categories; the senior is not.
      expect(screen.getByText('Samuel Canemolla')).toBeInTheDocument()
      expect(screen.queryByText('Joris Szulc')).not.toBeInTheDocument()
      expect(screen.getByText('1 licencié sur 3')).toBeInTheDocument()
    })

    it('takes several statuses at once, as a union', async () => {
      const user = userEvent.setup()
      setup()
      await open(user, 'Championnat seniors')
      await user.click(screen.getByRole('checkbox', { name: 'Hors catégorie' }))
      await user.click(screen.getByRole('checkbox', { name: 'Sans catégorie' }))
      expect(screen.getByText('Samuel Canemolla')).toBeInTheDocument()
      expect(screen.getByText('Alex Nemo')).toBeInTheDocument()
      expect(screen.queryByText('Joris Szulc')).not.toBeInTheDocument()
    })

    it('compounds across columns — the players who are both', async () => {
      const user = userEvent.setup()
      setup()
      await open(user, 'Championnat seniors')
      await user.click(screen.getByRole('checkbox', { name: 'Hors catégorie' }))
      await user.keyboard('{Escape}')
      await open(user, 'Championnat jeunes')
      await user.click(screen.getByRole('checkbox', { name: 'Par sa catégorie' }))
      // Only the cadet: out of the seniors, in by category for the youth.
      expect(screen.getByText('Samuel Canemolla')).toBeInTheDocument()
      expect(screen.queryByText('Alex Nemo')).not.toBeInTheDocument()
    })

    it('singles out the contradictions, which no verdict names on its own', async () => {
      const user = userEvent.setup()
      setup([], true, undefined, engagedIn('comp-seniors', 'p-cadet'))
      await open(user, 'Championnat seniors')
      await user.click(screen.getByRole('checkbox', { name: 'Non éligible mais déjà engagé' }))
      expect(screen.getByText('Samuel Canemolla')).toBeInTheDocument()
      expect(screen.queryByText('Alex Nemo')).not.toBeInTheDocument()
    })

    it('says how many statuses are on, and clears them', async () => {
      const user = userEvent.setup()
      setup()
      await open(user, 'Championnat seniors')
      await user.click(screen.getByRole('checkbox', { name: 'Hors catégorie' }))
      expect(screen.getByRole('button', { name: /Filtrer Championnat seniors/ }))
        .toHaveTextContent('1 statut')
      await user.click(screen.getByRole('button', { name: 'Effacer le filtre' }))
      expect(screen.getByText('Joris Szulc')).toBeInTheDocument()
    })

    it('closes on Escape without losing what was ticked', async () => {
      const user = userEvent.setup()
      setup()
      await open(user, 'Championnat seniors')
      await user.click(screen.getByRole('checkbox', { name: 'Hors catégorie' }))
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('checkbox', { name: 'Hors catégorie' })).not.toBeInTheDocument()
      expect(screen.queryByText('Joris Szulc')).not.toBeInTheDocument()
    })
  })

  describe('the rules behind a column', () => {
    it('states what the competition admits and what the club may do', async () => {
      const user = userEvent.setup()
      setup()
      await user.click(screen.getByRole('button', { name: 'Règles de « Championnat jeunes »' }))

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Compétition réservée')
      expect(dialog).toHaveTextContent('Benjamin, Minime, Cadet, Junior')
      expect(dialog).toHaveTextContent(/aucun autre licencié ne peut y être ajouté/)
      // One of three is a cadet.
      expect(dialog).toHaveTextContent('1 licencié éligible sur 3')
    })

    it('counts what the club has amended, and what it has left to settle', async () => {
      const user = userEvent.setup()
      setup(
        [{ clubId: CLUB, competitionId: 'comp-seniors', playerId: 'p-senior', effect: 'excluded' }],
        true,
        undefined,
        engagedIn('comp-seniors', 'p-senior'),
      )
      await user.click(screen.getByRole('button', { name: 'Règles de « Championnat seniors »' }))
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('0 ajouté et 1 exclu par le club')
      expect(dialog).toHaveTextContent(/1 licencié non éligible est pourtant engagé/)
    })

    it('says nothing about contradictions when there are none', async () => {
      const user = userEvent.setup()
      setup()
      await user.click(screen.getByRole('button', { name: 'Règles de « Championnat seniors »' }))
      expect(screen.getByRole('dialog')).not.toHaveTextContent('À régler')
    })
  })
})
