import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PhaseAvailabilitySection } from './PhaseAvailabilitySection'

// Avatar reads the auth token to fetch an image; nothing here needs a session.
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, token: null }) }))
import { EMPTY_PHASE_GRID, phaseAvailabilityGrid } from '@/lib/phaseAvailability'
import type { Game, GameAvailability, MatchDay, Player, Team } from '@/types'

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

const teamLabel = (t: Team) => `Rixheim PPA ${t.number}`

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
        teamLabel={teamLabel}
          keyTeam={{ number: 1 }}
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

  it('gathers the renforts on one row, their names a click away', () => {
    const dangelser = player('p9', 'Bastien', 'Dangelser')
    const coatpont = player('p8', 'Bertrand', 'De Coatpont')
    const grid = phaseAvailabilityGrid(
      { id: 't4', playerIds: ['p1', 'p2'] },
      games,
      [mougey, heurtin, dangelser, coatpont],
      [...availabilities, { gameId: 'g1', playerId: 'p9', status: 'available' }],
      [{ gameId: 'g1', teamId: 't4', playerIds: ['p1', 'p9', 'p8'] }],
    )
    render(
      <MemoryRouter>
        <PhaseAvailabilitySection grid={grid} columns={columns} required={4} unlicensed={new Set()} onGame={vi.fn()} teamLabel={teamLabel}
          keyTeam={{ number: 1 }} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('rowheader', { name: /Dangelser/ })).toBeNull()
    const row = screen.getByRole('rowheader', { name: 'Renforts' }).closest('tr')!
    expect(within(row).getByText('1/7')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(within(row).getByRole('button', { name: 'Renforts : Bastien Dangelser, Bertrand De Coatpont' }))

    const popover = screen.getByRole('dialog', { name: 'Renforts · J1' })
    expect(within(popover).getByRole('link', { name: 'Bastien Dangelser' })).toHaveAttribute('href', '/joueurs/p9')
    // Nothing but who: a borrowed player answers for their own team's matches.
    expect(within(popover).queryByText('OUI')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Their yes is not the pool; their place on the line-up is.
    const available = screen.getByRole('rowheader', { name: 'Disponibles' }).closest('tr')!
    expect(within(available).getAllByRole('cell')[0]).toHaveTextContent('1')
    const selected = screen.getByRole('rowheader', { name: 'Sélectionnés' }).closest('tr')!
    expect(within(selected).getAllByRole('cell')[0]).toHaveTextContent('3/4')
  })

  it('hatches a cell where another team of the club fields the player, and names it', () => {
    const team = { id: 't4', clubId: 'c1', phaseId: 'ph', number: 4, groupId: 'g4', playerIds: ['p1', 'p2'] } as Team
    const three = { ...team, id: 't3', number: 3, groupId: 'g3', color: '#2563eb', playerIds: [] } as Team
    const matchDays = [
      { id: 'a3', groupId: 'g4', number: 3, date: '2026-10-03' },
      { id: 'b3', groupId: 'g3', number: 3, date: '2026-10-04' },
    ] as MatchDay[]
    const ourGames = [{ id: 'g3', matchDay: matchDays[0] }]
    const clubGames = [
      { id: 'g3', matchDayId: 'a3', homeTeamId: 't4', awayTeamId: 'o' },
      { id: 'h3', matchDayId: 'b3', homeTeamId: 't3', awayTeamId: 'o' },
    ] as Game[]
    const grid = phaseAvailabilityGrid(team, ourGames, [mougey, heurtin], [
      { gameId: 'g3', playerId: 'p2', status: 'available' },
    ], [
      { gameId: 'h3', teamId: 't3', playerIds: ['p2'] },
    ], { teams: [team, three], games: clubGames, matchDays })
    render(
      <MemoryRouter>
        <PhaseAvailabilitySection
          grid={grid}
          columns={[{ gameId: 'g3', number: 3, date: '3/10' }]}
          required={4}
          unlicensed={new Set()}
          onGame={vi.fn()}
          teamLabel={teamLabel}
          keyTeam={{ number: 1 }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('En renfort')).toBeInTheDocument()
    const row = screen.getByRole('rowheader', { name: /Heurtin/ }).closest('tr')!
    // Oui, then Sél.: the loan counts as a journée played for the club.
    // Oui 1/1 (their answer), Sél. 1/1 (the loan).
    expect(within(row).getAllByText('1/1')).toHaveLength(2)

    // Their «oui» keeps its green under the hatching.
    const lent = within(row).getByRole('button', { name: 'En renfort en équipe 3, Oui' })
    expect(lent.firstElementChild).toHaveClass('bg-green-50')
    fireEvent.click(lent)
    expect(screen.getByRole('dialog', { name: 'En renfort · J3' })).toHaveTextContent('Rixheim PPA 3')
  })

  it('always shows the hatching key, with the badge it is given', () => {
    renderSection()
    expect(screen.getByText('En renfort')).toHaveTextContent('1')
  })

  it('leaves an unanswered cell empty: a dash said nothing more', () => {
    renderSection()
    const silent = screen.getByRole('rowheader', { name: /Heurtin/ }).closest('tr')!
    expect(within(silent).getAllByLabelText('Sans réponse')[0]).toBeEmptyDOMElement()
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
          grid={EMPTY_PHASE_GRID}
          columns={[]}
          required={4}
          unlicensed={new Set()}
          onGame={vi.fn()}
          teamLabel={teamLabel}
          keyTeam={{ number: 1 }}
        />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
