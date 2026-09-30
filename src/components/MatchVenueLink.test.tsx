import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Address } from '@/types'
import { MatchVenueLink } from './MatchVenueLink'

const address: Address = {
  id: 'a1', label: 'Gymnase principal', street: '12 rue du Sport', postalCode: '68170', city: 'Rixheim', isDefault: true,
}

describe('MatchVenueLink (#611)', () => {
  it('names the hall, prints the address, and opens the maps search in a new tab', () => {
    render(<MatchVenueLink venue={{ name: 'Gymnase principal', address }} />)
    const link = screen.getByRole('link', { name: /ouvrir dans le plan/ })
    expect(link.textContent).toBe('Gymnase principal · 12 rue du Sport, 68170 Rixheim')
    expect(link.getAttribute('href')).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('12 rue du Sport, 68170 Rixheim')}`,
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('prints the address alone when no hall is named', () => {
    render(<MatchVenueLink venue={{ address }} />)
    expect(screen.getByRole('link').textContent).toBe('12 rue du Sport, 68170 Rixheim')
  })

  it('renders nothing without a venue', () => {
    const { container } = render(<MatchVenueLink venue={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})
