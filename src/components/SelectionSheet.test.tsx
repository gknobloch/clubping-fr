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
