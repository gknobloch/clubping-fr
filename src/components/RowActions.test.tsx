import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RowActions } from './RowActions'

// #307 — row actions were 54x20px targets sitting 12px apart. Below md: they
// collapse into one "…" menu, and both renderings come off the same array.
//
// No stylesheet runs under happy-dom, so the `md:hidden` / `hidden md:flex`
// split does not apply here: both renderings are in the DOM at once. That is
// what makes the role split load-bearing, and it is what these tests pin — the
// inline buttons stay `button`, the menu rows are `menuitem`. The breakpoint
// itself is exercised in e2e/mobile-touch-targets.spec.ts, under the real CSS.

const edit = vi.fn()
const archive = vi.fn()

const actions = [
  { label: 'Modifier', onClick: edit },
  { label: 'Archiver', tone: 'danger' as const, onClick: archive },
]

beforeEach(() => {
  edit.mockClear()
  archive.mockClear()
})

const trigger = () => screen.getByRole('button', { name: 'Actions — PPA Rixheim' })

describe('RowActions', () => {
  it('keeps exactly one plain button per action, so row queries stay unambiguous', () => {
    render(<RowActions label="Actions — PPA Rixheim" actions={actions} />)

    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeInTheDocument()
  })

  it('renders no menu rows until the trigger is pressed', async () => {
    render(<RowActions label="Actions — PPA Rixheim" actions={actions} />)

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger())

    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Modifier',
      'Archiver',
    ])
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('runs the action and closes the menu', async () => {
    render(<RowActions label="Actions — PPA Rixheim" actions={actions} />)
    await userEvent.click(trigger())

    await userEvent.click(screen.getByRole('menuitem', { name: 'Archiver' }))

    expect(archive).toHaveBeenCalledTimes(1)
    expect(edit).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    render(<RowActions label="Actions — PPA Rixheim" actions={actions} />)
    await userEvent.click(trigger())

    await userEvent.keyboard('{Escape}')

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
    expect(trigger()).toHaveFocus()
  })

  it('opens onto the first row and cycles through with the arrow keys', async () => {
    render(<RowActions label="Actions — PPA Rixheim" actions={actions} />)
    await userEvent.click(trigger())

    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Archiver' })).toHaveFocus()

    // Wraps rather than dead-ending on the last row.
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Archiver' })).toHaveFocus()
  })

  it('closes when a click lands outside it', async () => {
    render(
      <>
        <RowActions label="Actions — PPA Rixheim" actions={actions} />
        <button type="button">Ailleurs</button>
      </>,
    )
    await userEvent.click(trigger())

    await userEvent.click(screen.getByRole('button', { name: 'Ailleurs' }))

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('drops falsy entries rather than rendering empty rows', async () => {
    render(
      <RowActions
        label="Actions — PPA Rixheim"
        actions={[{ label: 'Modifier', onClick: edit }, false, undefined, '']}
      />,
    )
    await userEvent.click(trigger())

    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })

  it('renders nothing at all when every action is filtered out', () => {
    const { container } = render(<RowActions actions={[false, null]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('carries the reason a disabled action is disabled across to the menu', async () => {
    render(
      <RowActions
        label="Actions — PPA Rixheim"
        actions={[
          {
            label: 'Supprimer',
            tone: 'danger',
            onClick: archive,
            disabled: true,
            title: 'Ce club a des équipes ou des joueurs rattachés',
          },
        ]}
      />,
    )
    await userEvent.click(trigger())

    const item = screen.getByRole('menuitem', { name: 'Supprimer' })
    expect(item).toBeDisabled()
    expect(item).toHaveAttribute('title', 'Ce club a des équipes ou des joueurs rattachés')
  })
})
