import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchSheetView, type MatchSheetPlayer } from './MatchSheetView'

// #383 — read-only aid for filling the official FFTT sheet at the table.

const players: MatchSheetPlayer[] = [
  { id: 'p1', firstName: 'Hugo', lastName: 'Bernard', license: '9900015', points: '1200' },
  { id: 'p2', firstName: 'Inès', lastName: 'Bernard', license: '9900020' },
  { id: 'p3', firstName: 'Paul', lastName: 'Martin', license: '9900011', points: '900' },
]

const setup = (overrides: Partial<Parameters<typeof MatchSheetView>[0]> = {}) =>
  render(
    <MatchSheetView
      matchup="Rixheim PPA 5 – Kembs TT 3"
      clubName="Rixheim PPA"
      affiliationNumber="06680011"
      players={players}
      onClose={vi.fn()}
      {...overrides}
    />,
  )

/** Position letters, in row order. */
const letters = () =>
  screen.getAllByRole('listitem').map((li) => (li.textContent ?? '').trim().charAt(0))

const names = () =>
  screen.getAllByRole('listitem').map((li) => (li.textContent ?? '').replace(/[▲▼]/g, '').slice(1, 12))

describe('MatchSheetView (#383)', () => {
  it('shows the club identity and the line-up', () => {
    setup()
    expect(screen.getByText('Rixheim PPA')).toBeInTheDocument()
    expect(screen.getByText('06680011')).toBeInTheDocument()
    expect(screen.getByText('Joueurs (3)')).toBeInTheDocument()
    expect(screen.getByText('9900015')).toBeInTheDocument()
  })

  // Unset points arrive as '' from the roster, which must read as missing
  // rather than as an empty "pts".
  it('renders missing points as a dash', () => {
    setup({ players: [{ id: 'p1', firstName: 'Hugo', lastName: 'Bernard', points: '' }] })
    expect(screen.getByText('— pts')).toBeInTheDocument()
  })

  it('defaults to A.. at home and ..Z away', () => {
    const { unmount } = setup({ isHome: true })
    expect(letters()).toEqual(['A', 'B', 'C'])
    unmount()

    setup({ isHome: false })
    expect(letters()).toEqual(['X', 'Y', 'Z'])
  })

  it('switches letter set on demand', async () => {
    setup({ isHome: true })
    await userEvent.click(screen.getByRole('button', { name: 'XYZ' }))
    expect(letters()).toEqual(['X', 'Y', 'Z'])
  })

  // The letter belongs to the position on the sheet, not to the player, so
  // reordering moves names while A, B, C stay top to bottom.
  it('reorders players while the letters stay in place', async () => {
    setup()
    expect(names()[0]).toContain('Hugo')

    await userEvent.click(screen.getByRole('button', { name: /Descendre Hugo/ }))

    expect(names()[0]).toContain('Inès')
    expect(names()[1]).toContain('Hugo')
    expect(letters()).toEqual(['A', 'B', 'C'])
  })

  it('cannot move the first row up or the last row down', () => {
    setup()
    expect(screen.getByRole('button', { name: /Monter Hugo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Descendre Paul/ })).toBeDisabled()
  })

  it('says the order is not saved', () => {
    setup()
    expect(screen.getByText(/n'est pas enregistré/)).toBeInTheDocument()
  })

  it('points at the line-up step when nothing is picked yet', () => {
    setup({ players: [] })
    expect(screen.getByText(/Aucun joueur sélectionné/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ABC' })).not.toBeInTheDocument()
  })
})
