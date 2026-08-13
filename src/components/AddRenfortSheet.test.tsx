import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddRenfortSheet } from './AddRenfortSheet'
import type { Player } from '@/types'

// #380 — a captain could not field a borrowed player from a phone at all: the
// only way in was the desktop-only "Autres joueurs" matrix.

const player = (id: string, firstName: string, lastName: string): Player => ({
  id,
  firstName,
  lastName,
  licenseNumber: id,
  email: '',
  phone: '',
  status: 'active',
  clubId: 'club-1',
})

const candidates = [
  player('p1', 'Enzo', 'Lotz'),
  player('p2', 'Gilles', 'Knobloch'),
  player('p3', 'Chloé', 'Bernard'),
]

const setup = (overrides: Partial<Parameters<typeof AddRenfortSheet>[0]> = {}) => {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(
    <AddRenfortSheet
      candidates={candidates}
      teamLabel="PPA Rixheim 5"
      isEligible={() => true}
      availabilityOf={() => undefined}
      teamNameOf={() => undefined}
      onPick={onPick}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onPick, onClose }
}

describe('AddRenfortSheet (#380)', () => {
  it('picks a player and reports the choice', async () => {
    const { onPick } = setup()

    await userEvent.click(screen.getByRole('button', { name: /Chloé Bernard/ }))

    expect(onPick).toHaveBeenCalledWith('p3')
  })

  // Listed and disabled, not filtered out: brûlage is the rule captains trip
  // over most, and an absent name reads as a bug rather than as a rule.
  it('shows ineligible players disabled rather than hiding them', async () => {
    const { onPick } = setup({ isEligible: (id) => id !== 'p1' })

    const burnt = screen.getByRole('button', { name: /Enzo Lotz/ })
    expect(burnt).toBeDisabled()
    expect(within(burnt).getByText('Brûlage')).toBeInTheDocument()

    await userEvent.click(burnt)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('sorts the eligible players ahead of the ineligible ones', () => {
    setup({ isEligible: (id) => id === 'p2' })

    const names = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    const eligibleAt = names.findIndex((n) => n.includes('Gilles Knobloch'))
    const burntAt = names.findIndex((n) => n.includes('Chloé Bernard'))
    expect(eligibleAt).toBeLessThan(burntAt)
  })

  it('filters by name', async () => {
    setup()

    await userEvent.type(screen.getByLabelText('Rechercher un joueur'), 'lotz')

    expect(screen.getByRole('button', { name: /Enzo Lotz/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chloé Bernard/ })).not.toBeInTheDocument()
  })

  // Adding is allowed on a full line-up — the model tolerates it and captains
  // often add before removing — so the sheet says so instead of letting the
  // count turn red afterwards.
  it('warns when the line-up is already complete', () => {
    setup({ lineUpFull: true })
    expect(screen.getByText(/composition est déjà complète/i)).toBeInTheDocument()
  })

  it('says so when every club player is already in the line-up', () => {
    setup({ candidates: [] })
    expect(screen.getByText(/déjà dans cette composition/i)).toBeInTheDocument()
  })
})
