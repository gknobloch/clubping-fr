import type { Address } from '@shared/types'
import { formatAddress, mapsUrl } from './club'

const address: Address = {
  id: 'a1',
  label: 'Salle des sports',
  street: '12 rue du Stade',
  postalCode: '68170',
  city: 'Rixheim',
  isDefault: true,
}

describe('formatAddress', () => {
  it('writes the address on one line', () => {
    expect(formatAddress(address)).toBe('12 rue du Stade, 68170 Rixheim')
  })
})

describe('mapsUrl', () => {
  // jest-expo runs as iOS, so this is the maps:// branch. The point of the test
  // is the encoding: an unescaped address breaks the URL on the first space.
  it('hands the encoded address to the native maps app', () => {
    expect(mapsUrl(address)).toBe(`maps://?q=${encodeURIComponent('12 rue du Stade, 68170 Rixheim')}`)
  })

  it('escapes characters that would truncate the query', () => {
    const url = mapsUrl({ ...address, street: '1 rue des Fleurs & Jardins' })
    expect(url).not.toContain(' ')
    expect(url).toContain('%26') // &
  })
})
