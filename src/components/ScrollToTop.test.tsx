import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { ScrollToTop } from './ScrollToTop'

// A tiny toolbar that drives navigation from inside the router, so `ScrollToTop`
// sees the same location updates the app would.
function Nav() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/joueurs')}>route</button>
      <button onClick={() => navigate('/journees#team-1')}>route with hash</button>
      <button onClick={() => navigate({ hash: '#other-players' })}>hash only</button>
      <button onClick={() => navigate(-1)}>back</button>
    </>
  )
}

const renderAt = (initialEntries: string[]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ScrollToTop />
      <Nav />
    </MemoryRouter>,
  )

describe('ScrollToTop (#400)', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    scrollTo.mockRestore()
  })

  it('scrolls to the top when the pathname changes', () => {
    const { getByText } = renderAt(['/journees'])
    scrollTo.mockClear() // ignore any call on mount

    fireEvent.click(getByText('route'))

    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('leaves the scroll alone when only the hash changes', () => {
    const { getByText } = renderAt(['/journees'])
    scrollTo.mockClear()

    fireEvent.click(getByText('hash only'))

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not reset when the new route carries a hash (deep-link anchor)', () => {
    const { getByText } = renderAt(['/joueurs'])
    scrollTo.mockClear()

    fireEvent.click(getByText('route with hash'))

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not force the top on back/forward (POP)', () => {
    const { getByText } = renderAt(['/journees'])
    fireEvent.click(getByText('route')) // push /joueurs
    scrollTo.mockClear()

    fireEvent.click(getByText('back')) // POP back to /journees

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
