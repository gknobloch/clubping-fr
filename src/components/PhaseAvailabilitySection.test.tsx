import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PhaseAvailabilitySection } from './PhaseAvailabilitySection'
import { phaseAvailabilityGrid } from '@/lib/phaseAvailability'
import type { GameAvailability, Player } from '@/types'

// Les disponibilités de toute la phase sur la fiche équipe (#623).

const player = (id: string, firstName: string, lastName: string): Player =>
  ({ id, firstName, lastName, licenseNumber: '', phone: '', status: 'active', clubId: 'c1' }) as Player

const mougey = player('p1', 'Mathieu', 'Mougey')
const heurtin = player('p2', 'Christophe', 'Heurtin')
const games = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `g${n}` }))
const columns = games.map((g, i) => ({ gameId: g.id, number: i + 1, date: `${i + 1}/10` }))
const answers = ['available', 'available', 'maybe', 'available', 'available', 'maybe', 'available'] as const
const availabilities: GameAvailability[] = answers.map((status, i) => ({
  gameId: `g${i + 1}`,
  playerId: 'p1',
  status,
}))

function renderSection(onGame = vi.fn()) {
  const grid = phaseAvailabilityGrid(
    { id: 't4', playerIds: ['p1', 'p2'] },
    games,
    [mougey, heurtin],
    availabilities,
    [{ gameId: 'g1', teamId: 't4', playerIds: ['p1'] }],
  )
  render(
    <MemoryRouter>
      <PhaseAvailabilitySection
        grid={grid}
        columns={columns}
        required={4}
        unlicensed={new Set(['p2'])}
        onGame={onGame}
      />
    </MemoryRouter>,
  )
  return onGame
}

describe('PhaseAvailabilitySection', () => {
  it('gives each player a row, their answers, and the ratio over the phase', () => {
    renderSection()

    const row = screen.getByRole('rowheader', { name: /Mougey/ }).closest('tr')!
    expect(within(row).getByText('5/7')).toBeInTheDocument()
    expect(within(row).getByLabelText('Oui, dans la composition')).toBeInTheDocument()
    expect(within(row).getAllByLabelText('Peut-être')).toHaveLength(2)

    const silent = screen.getByRole('rowheader', { name: /Heurtin/ }).closest('tr')!
    expect(within(silent).getByText('0/7')).toBeInTheDocument()
    expect(within(silent).getAllByLabelText('Sans réponse')).toHaveLength(7)
  })

  it('carries the licence badge with the name (#488)', () => {
    renderSection()

    const silent = screen.getByRole('rowheader', { name: /Heurtin/ })
    expect(within(silent).getByText('Sans licence')).toBeInTheDocument()
  })

  it('opens the match from its journée header', () => {
    const onGame = renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Journée 3, le 3/10' }))

    expect(onGame).toHaveBeenCalledWith('g3')
  })

  it('says nothing when the phase has no match', () => {
    const { container } = render(
      <MemoryRouter>
        <PhaseAvailabilitySection
          grid={{ rows: [], availableByGame: [] }}
          columns={[]}
          required={4}
          unlicensed={new Set()}
          onGame={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
