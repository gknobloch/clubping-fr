import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrandMark } from './BrandMark'

describe('BrandMark (#334)', () => {
  it('is decorative by default, so it adds no noise next to the "Club Ping" wordmark', () => {
    const { container } = render(<BrandMark />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBe('presentation')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('becomes a labelled image when it stands alone', () => {
    render(<BrandMark title="Club Ping" />)
    const svg = screen.getByRole('img', { name: 'Club Ping' })
    // A title means it is no longer hidden from the accessibility tree.
    expect(svg.getAttribute('aria-hidden')).toBeNull()
  })

  it('scopes the clipPath id so two marks on one page do not collide', () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
      </>
    )
    const ids = [...container.querySelectorAll('clipPath')].map((n) => n.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)

    // No colons: Safari will not resolve url(#:r0:), which useId() emits raw.
    ids.forEach((id) => expect(id).not.toContain(':'))

    // Each mark must point at its own clipPath, not the other's.
    ;[...container.querySelectorAll('svg')].forEach((svg, i) => {
      const clipped = svg.querySelector('[clip-path]')!
      expect(clipped.getAttribute('clip-path')).toBe(`url(#${ids[i]})`)
    })
  })
})
