import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from './PageHeader'
import { APP_HEADER_HEIGHT, SCROLL_GUTTER, SCROLL_OFFSET_VAR } from '@/lib/pageScrollOffset'

// PageHeader pulls in ClubLogo, which reads the auth token. Nothing here passes
// a club, so the context is never touched — but the router is, via Link.
const renderHeader = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

const offset = () => document.documentElement.style.getPropertyValue(SCROLL_OFFSET_VAR)

describe('PageHeader — two levels (#311)', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.style.removeProperty(SCROLL_OFFSET_VAR)
  })

  it('renders no sticky toolbar when a screen has no controls', () => {
    renderHeader(<PageHeader title="Équipes" actions={<button>Nouvelle équipe</button>} />)

    expect(screen.getByRole('heading', { name: 'Équipes' })).toBeInTheDocument()
    expect(screen.queryByTestId('page-toolbar')).not.toBeInTheDocument()
  })

  it('leaves the scroll offset alone when there is no toolbar', () => {
    renderHeader(<PageHeader title="Équipes" />)
    // Untouched, so anchors fall back to the value index.css seeds.
    expect(offset()).toBe('')
  })

  it('renders controls in a sticky toolbar, separate from the identity box', () => {
    renderHeader(
      <PageHeader title="Journées" controls={<button>Phase suivante</button>} />
    )

    const toolbar = screen.getByTestId('page-toolbar')
    expect(toolbar).toHaveClass('sticky')
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Phase suivante' }))
    // Identity must not be dragged into the sticky level — that stacking is
    // exactly what ate two thirds of a phone screen on Journées.
    expect(toolbar).not.toContainElement(screen.getByRole('heading', { name: 'Journées' }))
  })

  it('publishes a measured scroll offset while a toolbar is mounted', () => {
    renderHeader(<PageHeader title="Journées" controls={<button>Phase suivante</button>} />)

    // happy-dom reports 0 for every box, so this pins the arithmetic and the
    // wiring, not the real height: app bar + toolbar + gutter.
    expect(offset()).toBe(`${APP_HEADER_HEIGHT + 0 + SCROLL_GUTTER}px`)
  })

  it('drops the offset again on unmount, so the next screen does not inherit it', () => {
    const { unmount } = renderHeader(
      <PageHeader title="Journées" controls={<button>Phase suivante</button>} />
    )
    expect(offset()).not.toBe('')

    unmount()
    expect(offset()).toBe('')
  })
})
