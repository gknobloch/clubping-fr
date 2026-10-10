import { describe, expect, it } from 'vitest'
import { sharedAddressOf, sharedAddresses } from './sharedAddresses'

// #655, step 3 — one address, several people: the cases 0063 could not settle.

const member = (id: string, personId: string | undefined, email: string | undefined, firstName: string, clubId = 'club-a') =>
  ({ id, personId, email, firstName, lastName: 'Henaut', clubId })

describe('sharedAddresses', () => {
  it('groups the people behind one address, case and space aside', () => {
    const groups = sharedAddresses([
      member('benjamin', 'p-benjamin', 'Henaut@example.fr', 'Benjamin'),
      member('sacha', 'p-sacha', ' henaut@example.fr', 'Sacha', 'club-b'),
      member('zoe', 'p-zoe', 'zoe@example.fr', 'Zoé'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].email).toBe('Henaut@example.fr')
    expect(groups[0].people.map((p) => p.firstName)).toEqual(['Benjamin', 'Sacha'])
    expect(groups[0].people[1].profiles).toEqual([{ userId: 'sacha', clubId: 'club-b' }])
  })

  it('is not one person playing in two clubs', () => {
    expect(sharedAddresses([
      member('gilles-rixheim', 'p-gilles', 'g@example.fr', 'Gilles'),
      member('gilles-landser', 'p-gilles', 'g@example.fr', 'Gilles', 'club-agr'),
    ])).toEqual([])
  })

  it('shares nothing without an address, and skips a member with no person', () => {
    expect(sharedAddresses([
      member('a', 'p-a', '', 'A'),
      member('b', 'p-b', undefined, 'B'),
      member('c', undefined, 'c@example.fr', 'C'),
      member('d', 'p-d', 'c@example.fr', 'D'),
    ])).toEqual([])
  })

  it('finds the group of one person', () => {
    const members = [
      member('benjamin', 'p-benjamin', 'henaut@example.fr', 'Benjamin'),
      member('sacha', 'p-sacha', 'henaut@example.fr', 'Sacha'),
    ]
    expect(sharedAddressOf('p-sacha', members)?.people).toHaveLength(2)
    expect(sharedAddressOf('p-zoe', members)).toBeUndefined()
  })
})
