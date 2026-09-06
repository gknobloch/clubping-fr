import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Player } from '@/types'
import { SelectionSheet } from './SelectionSheet'

function player(id: string, firstName: string, lastName: string, status: 'active' | 'archived' = 'active'): Player {
  return {
    id, firstName, lastName, licenseNumber: `L-${id}`, email: `${id}@example.com`,
    phone: '', status, clubId: 'club-1',
  }
}

/** Four on the roster, `otherCount` outside it — enough to cross the filter's threshold. */
function renderSheet({
  roster = [player('r1', 'Alice', 'Martin'), player('r2', 'Bob', 'Durand')],
  others = [] as Player[],
  initialSelection = [] as string[],
  unlicensed = undefined as ReadonlySet<string> | undefined,
  onSave = vi.fn(),
} = {}) {
  render(
    <SelectionSheet
      teamLabel="Rixheim PPA 5"
      playersPerGame={4}
      roster={roster}
      others={others}
      initialSelection={initialSelection}
      availabilityOf={() => undefined}
      committedElsewhere={new Map()}
      unlicensed={unlicensed}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  )
  return { onSave }
}

const manyOthers = [
  player('o1', 'Nicolas', 'Broglin'),
  player('o2', 'Gilles', 'Knobloch'),
  player('o3', 'David', 'Schmitt'),
  player('o4', 'Frédéric', 'Zilbermann'),
  player('o5', 'Pascal', 'Afflard'),
  player('o6', 'Ryan', 'Alves'),
  player('o7', 'Jacky', 'Antony'),
  player('o8', 'Quentin', 'Broglin'),
  player('o9', 'Samuel', 'Carnemolla'),
  player('o10', 'Patrick', 'Cartagena'),
]

describe('SelectionSheet — filtrer par nom (#454)', () => {
  it('n’offre pas de recherche sur une liste courte', () => {
    renderSheet({ others: [player('o1', 'Nicolas', 'Broglin')] })
    expect(screen.queryByLabelText('Rechercher un joueur')).not.toBeInTheDocument()
  })

  it('offre la recherche au-delà de dix noms', () => {
    renderSheet({ others: manyOthers })
    expect(screen.getByLabelText('Rechercher un joueur')).toBeInTheDocument()
  })

  it('filtre les deux sections, accents et casse indifférents', async () => {
    const user = userEvent.setup()
    renderSheet({ others: manyOthers })

    await user.type(screen.getByLabelText('Rechercher un joueur'), 'frederic')

    expect(screen.getByText('Frédéric Zilbermann')).toBeInTheDocument()
    expect(screen.queryByText('Nicolas Broglin')).not.toBeInTheDocument()
    // The roster section goes too — it is one list to the person searching.
    expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument()
  })

  it('le dit quand rien ne correspond', async () => {
    const user = userEvent.setup()
    renderSheet({ others: manyOthers })

    await user.type(screen.getByLabelText('Rechercher un joueur'), 'zzz')

    expect(screen.getByText(/Aucun joueur ne correspond/)).toBeInTheDocument()
  })

  it('garde le joueur sélectionnable après avoir filtré', async () => {
    const user = userEvent.setup()
    const { onSave } = renderSheet({ others: manyOthers })

    await user.type(screen.getByLabelText('Rechercher un joueur'), 'knobloch')
    await user.click(screen.getByText('Gilles Knobloch'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSave).toHaveBeenCalledWith(['o2'])
  })
})

describe('SelectionSheet — joueurs archivés (#454)', () => {
  it('n’aligne pas un joueur archivé resté sur la feuille d’équipe', () => {
    renderSheet({
      roster: [player('r1', 'Alice', 'Martin'), player('r2', 'Bob', 'Durand', 'archived')],
    })
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument()
  })

  it('le garde visible s’il est déjà dans la composition, pour pouvoir l’en retirer', () => {
    renderSheet({
      roster: [player('r1', 'Alice', 'Martin'), player('r2', 'Bob', 'Durand', 'archived')],
      initialSelection: ['r2'],
    })
    expect(screen.getByText('Bob Durand')).toBeInTheDocument()
  })
})

// #488 — a member the FFTT has not listed a licence for this season may not be
// fielded. The sheet is where that mistake would be made, so it says so twice:
// beside the name, and about the line-up as it stands.
describe('SelectionSheet — licence not validated (#488)', () => {
  it('tags the name, without removing them from the list', () => {
    renderSheet({ unlicensed: new Set(['r2']) })
    const row = screen.getByRole('button', { name: /Bob Durand/ })
    expect(row).toHaveTextContent('Sans licence')
    expect(screen.getByRole('button', { name: /Alice Martin/ })).not.toHaveTextContent('Sans licence')
  })

  it('says nothing at all until one of them is actually picked', () => {
    renderSheet({ unlicensed: new Set(['r2']) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names the player once one is on the sheet', async () => {
    const user = userEvent.setup()
    renderSheet({ unlicensed: new Set(['r2']) })
    await user.click(screen.getByRole('button', { name: /Bob Durand/ }))
    expect(screen.getByRole('alert'))
      .toHaveTextContent(/Bob Durand n’a pas de licence validée pour cette saison/)
  })

  it('names all of them when several are, and counts them', async () => {
    const user = userEvent.setup()
    renderSheet({ unlicensed: new Set(['r1', 'r2']) })
    await user.click(screen.getByRole('button', { name: /Alice Martin/ }))
    await user.click(screen.getByRole('button', { name: /Bob Durand/ }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('2 joueurs alignés')
    expect(alert).toHaveTextContent('Alice Martin, Bob Durand')
  })

  it('withdraws the warning when the player is taken back off', async () => {
    const user = userEvent.setup()
    renderSheet({ unlicensed: new Set(['r2']), initialSelection: ['r2'] })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Bob Durand/ }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // It never blocks: an unvalidated licence is usually a renewal in flight, and
  // the captain is the one who knows.
  it('still saves the line-up it warned about', async () => {
    const user = userEvent.setup()
    const { onSave } = renderSheet({ unlicensed: new Set(['r2']) })
    await user.click(screen.getByRole('button', { name: /Bob Durand/ }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenCalledWith(['r2'])
  })

  it('is silent for a club whose licences are simply not known', () => {
    renderSheet()
    expect(screen.queryByText('Sans licence')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
