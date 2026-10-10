import { describe, expect, it } from 'vitest'
import { addressOwner, addressTakenMessage } from './addressOwner'

// #655, 4 bis — one address, one person.

const m = (id: string, personId: string, email: string | undefined, firstName = 'X') =>
  ({ id, personId, email, firstName, lastName: 'Henaut' })
const members = [
  m('benjamin', 'p-benjamin', 'Henaut@example.fr', 'Benjamin'),
  m('g-rix', 'p-g', 'g@example.fr', 'Gilles'),
  m('g-lan', 'p-g', 'g@example.fr', 'Gilles'),
]

describe('addressOwner', () => {
  it('finds the other person behind an address, case and space aside', () => {
    expect(addressOwner(' henaut@example.fr', members)?.id).toBe('benjamin')
  })

  it('is not the person the address is meant for — on any of their profiles', () => {
    expect(addressOwner('g@example.fr', members, { personId: 'p-g' })).toBeUndefined()
    expect(addressOwner('henaut@example.fr', members, { id: 'benjamin' })).toBeUndefined()
  })

  it('finds nobody behind no address', () => {
    expect(addressOwner('', members)).toBeUndefined()
    expect(addressOwner(undefined, members)).toBeUndefined()
  })

  it('says whose address it is', () => {
    expect(addressTakenMessage({ firstName: 'Benjamin', lastName: 'Henaut' }))
      .toMatch(/^Cette adresse est déjà celle de Benjamin Henaut/)
  })
})
