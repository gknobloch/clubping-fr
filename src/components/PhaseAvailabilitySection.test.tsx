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

    // Oui, then Sél.: Mougey is on one line-up of seven.
    expect(within(row).getByText('1/7')).toBeInTheDocument()

    const silent = screen.getByRole('rowheader', { name: /Heurtin/ }).closest('tr')!
    expect(within(silent).getAllByText('0/7')).toHaveLength(2)
    expect(within(silent).getAllByLabelText('Sans réponse')).toHaveLength(7)
  })

  it('totals each journée: who said yes, and who the line-up names', () => {
    renderSection()

    const available = screen.getByRole('rowheader', { name: 'Disponibles' }).closest('tr')!
    expect(within(available).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      ['1', '1', '0', '1', '1', '0', '1'],
    )
    const selected = screen.getByRole('rowheader', { name: 'Sélectionnés' }).closest('tr')!
    const counts = within(selected).getAllByRole('cell')
    expect(counts[0]).toHaveTextContent('1/4')
    // One out of four is a line-up started and wrong; none is one not started.
    expect(counts[0]).toHaveClass('text-accent-600')
    expect(counts[1]).toHaveTextContent('0/4')
    expect(counts[1]).toHaveClass('text-slate-400')
  })

  it('lists a renfort without a «Oui» total, and leaves them out of the pool', () => {
    const renfort = player('p9', 'Bastien', 'Dangelser')
    const grid = phaseAvailabilityGrid(
      { id: 't4', playerIds: ['p1', 'p2'] },
      games,
      [mougey, heurtin, renfort],
      [...availabilities, { gameId: 'g1', playerId: 'p9', status: 'available' }],
      [{ gameId: 'g1', teamId: 't4', playerIds: ['p1', 'p9'] }],
    )
    render(
      <MemoryRouter>
        <PhaseAvailabilitySection grid={grid} columns={columns} required={4} unlicensed={new Set()} onGame={vi.fn()} />
      </MemoryRouter>,
    )

    const row = screen.getByRole('rowheader', { name: /Dangelser/ }).closest('tr')!
    expect(within(row).getByTitle('Renfort')).toHaveTextContent('Renf.')
    expect(within(row).getByLabelText('Oui, dans la composition')).toBeInTheDocument()
    const available = screen.getByRole('rowheader', { name: 'Disponibles' }).closest('tr')!
    expect(within(available).getAllByRole('cell')[0]).toHaveTextContent('1')
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
          grid={{ rows: [], availableByGame: [], selectedByGame: [] }}
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
