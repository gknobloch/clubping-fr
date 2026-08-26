import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Player } from '@/types'
import { PlayerPicker } from './PlayerPicker'

function player(id: string, firstName: string, lastName: string): Player {
  return {
    id, firstName, lastName, licenseNumber: `L-${id}`, email: `${id}@example.com`,
    phone: '', status: 'active', clubId: 'club-1',
  }
}

const club = [
  player('p1', 'Nicolas', 'Broglin'),
  player('p2', 'Gilles', 'Knobloch'),
  player('p3', 'David', 'Schmitt'),
  player('p4', 'Frédéric', 'Zilbermann'),
  player('p5', 'Pascal', 'Afflard'),
  player('p6', 'Ryan', 'Alves'),
  player('p7', 'Jacky', 'Antony'),
  player('p8', 'Quentin', 'Broglin'),
  player('p9', 'Samuel', 'Carnemolla'),
  player('p10', 'Patrick', 'Cartagena'),
  player('p11', 'Eric', 'Cavasino'),
]

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '+ Ajouter un joueur' }))

describe('PlayerPicker (#454)', () => {
  it('ouvre une feuille listant les joueurs proposés', async () => {
    const user = userEvent.setup()
    render(<PlayerPicker players={club.slice(0, 2)} onPick={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await open(user)

    const sheet = screen.getByRole('dialog')
    expect(sheet).toBeInTheDocument()
    expect(screen.getByText('Nicolas Broglin')).toBeInTheDocument()
  })

  it('n’offre pas de recherche sur une liste courte', async () => {
    const user = userEvent.setup()
    render(<PlayerPicker players={club.slice(0, 3)} onPick={vi.fn()} />)
    await open(user)

    expect(screen.queryByLabelText('Rechercher un joueur')).not.toBeInTheDocument()
  })

  it('filtre par nom au-delà de dix joueurs, accents indifférents', async () => {
    const user = userEvent.setup()
    render(<PlayerPicker players={club} onPick={vi.fn()} />)
    await open(user)

    await user.type(screen.getByLabelText('Rechercher un joueur'), 'zilbermann')

    expect(screen.getByText('Frédéric Zilbermann')).toBeInTheDocument()
    expect(screen.queryByText('Nicolas Broglin')).not.toBeInTheDocument()
  })

  it('remonte le joueur choisi et reste ouvert pour le suivant', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<PlayerPicker players={club} onPick={onPick} />)
    await open(user)

    await user.click(screen.getByText('Gilles Knobloch'))

    expect(onPick).toHaveBeenCalledWith('p2')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('le dit quand rien ne correspond', async () => {
    const user = userEvent.setup()
    render(<PlayerPicker players={club} onPick={vi.fn()} />)
    await open(user)

    await user.type(screen.getByLabelText('Rechercher un joueur'), 'zzz')

    expect(screen.getByText(/Aucun joueur ne correspond/)).toBeInTheDocument()
  })

  it('repart d’une recherche vierge à la réouverture', async () => {
    const user = userEvent.setup()
    render(<PlayerPicker players={club} onPick={vi.fn()} />)
    await open(user)
    await user.type(screen.getByLabelText('Rechercher un joueur'), 'zilbermann')
    await user.click(screen.getByRole('button', { name: 'Fermer' }))

    await open(user)

    expect(screen.getByLabelText('Rechercher un joueur')).toHaveValue('')
    expect(screen.getByText('Nicolas Broglin')).toBeInTheDocument()
  })
})
