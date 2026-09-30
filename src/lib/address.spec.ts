import { describe, it, expect } from 'vitest'
import type { Address } from '../types'
import { formatAddress, mapsSearchUrl } from './address'

const address: Address = {
  id: 'a1', label: 'Salle des sports', street: '12 rue du Stade', postalCode: '68170', city: 'Rixheim', isDefault: true,
}

describe('formatAddress', () => {
  it('writes the address on one line', () => {
    expect(formatAddress(address)).toBe('12 rue du Stade, 68170 Rixheim')
  })

  it('drops a blank part rather than printing a stray comma', () => {
    expect(formatAddress({ ...address, street: '' })).toBe('68170 Rixheim')
    expect(formatAddress({ ...address, postalCode: ' ' })).toBe('12 rue du Stade, Rixheim')
    expect(formatAddress({ ...address, street: '', postalCode: '', city: '' })).toBe('')
  })
})

describe('mapsSearchUrl', () => {
  it('searches the street address, not the hall name', () => {
    const url = new URL(mapsSearchUrl(address))
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/')
    expect(url.searchParams.get('query')).toBe('12 rue du Stade, 68170 Rixheim')
  })

  it('escapes what would otherwise cut the query short', () => {
    const url = mapsSearchUrl({ ...address, street: '1 rue des Fleurs & Jardins' })
    expect(url).not.toContain(' ')
    expect(url).toContain('%26')
  })
})
