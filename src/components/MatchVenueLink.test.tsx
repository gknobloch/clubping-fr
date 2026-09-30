import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Address } from '@/types'
import { MatchVenueLink } from './MatchVenueLink'

const address: Address = {
  id: 'a1', label: 'Gymnase principal', street: '12 rue du Sport', postalCode: '68170', city: 'Rixheim', isDefault: true,
}

describe('MatchVenueLink (#611)', () => {
  it('names the hall, prints the address, and opens the maps search in a new tab', () => {
    render(<MatchVenueLink venue={{ kind: 'address', name: 'Gymnase principal', address }} />)
    const link = screen.getByRole('link', { name: /ouvrir dans le plan/ })
    expect(link.textContent).toBe('Gymnase principal · 12 rue du Sport, 68170 Rixheim')
    expect(link.getAttribute('href')).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('12 rue du Sport, 68170 Rixheim')}`,
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('prints the address alone when no hall is named', () => {
    render(<MatchVenueLink venue={{ kind: 'address', address }} />)
    expect(screen.getByRole('link').textContent).toBe('12 rue du Sport, 68170 Rixheim')
  })

  it('prints the town and searches it when no address is on file', () => {
    render(<MatchVenueLink venue={{ kind: 'town', town: 'Etival' }} />)
    const link = screen.getByRole('link', { name: /ouvrir dans le plan/ })
    expect(link.textContent).toBe('Etival')
    expect(new URL(link.getAttribute('href')!).searchParams.get('query')).toBe('Etival, France')
  })

  it('renders nothing without a venue', () => {
    const { container } = render(<MatchVenueLink venue={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})
