import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

const authState = vi.hoisted(() => ({
  user: { id: 'u1', email: 'a@b.c', role: 'general_admin', isPlayer: false } as Record<string, unknown> | null,
}))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: authState.user, displayName: 'admin@example.com', logout: vi.fn() }),
}))

// happy-dom does not evaluate media queries, so the `md:` breakpoint has no
// effect here: the desktop bar is always in the DOM and the drawer joins it
// when open. That makes link *counts* the useful signal — one copy means the
// drawer is closed, two means it is open. Whether the CSS actually hides the
// bar on a phone is covered by e2e/mobile-nav.spec.ts, where a real engine
// applies the stylesheet.
function setup(user: Record<string, unknown> | null) {
  authState.user = user
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell />} />
      </Routes>
    </MemoryRouter>
  )
}

const toggle = () => screen.getByRole('button', { name: /menu/i })

describe('AppShell — navigation (#304)', () => {
  beforeEach(() => {
    authState.user = null
  })

  it('starts with the menu closed', () => {
    setup({ id: 'u1', role: 'general_admin', isPlayer: false })

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveAccessibleName('Ouvrir le menu')
    expect(screen.getAllByRole('link', { name: 'Clubs' })).toHaveLength(1)
  })

  it('opens and closes the drawer from the toggle', async () => {
    setup({ id: 'u1', role: 'general_admin', isPlayer: false })

    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveAccessibleName('Fermer le menu')
    expect(screen.getAllByRole('link', { name: 'Clubs' })).toHaveLength(2)

    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('link', { name: 'Clubs' })).toHaveLength(1)
  })

  it('closes the drawer on Escape', async () => {
    setup({ id: 'u1', role: 'general_admin', isPlayer: false })

    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard('{Escape}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('gives a general admin the full set of links', () => {
    setup({ id: 'u1', role: 'general_admin', isPlayer: false })

    for (const label of ['Accueil', 'Clubs', 'Saisons', 'Phases', 'Divisions', 'Groupes', 'Équipes', 'Journées', 'Joueurs']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    }
  })

  it('gives a club admin its own set, with Club when it has one', () => {
    setup({ id: 'u2', role: 'club_admin', isPlayer: false, clubId: 'club-1' })

    for (const label of ['Accueil', 'Club', 'Équipes', 'Journées', 'Joueurs']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    }
    expect(screen.queryByRole('link', { name: 'Saisons' })).not.toBeInTheDocument()
  })

  it('omits Club for a player without a club', () => {
    setup({ id: 'u3', role: 'player', isPlayer: true })

    expect(screen.queryByRole('link', { name: 'Club' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Équipes' }).length).toBeGreaterThan(0)
  })

  it('gives an unknown role nothing but Accueil', () => {
    setup({ id: 'u4', role: 'something_else', isPlayer: false })

    expect(screen.getAllByRole('link', { name: 'Accueil' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Équipes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Clubs' })).not.toBeInTheDocument()
  })
})
