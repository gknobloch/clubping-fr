import { describe, expect, it } from 'vitest'
import { mergeTarget, sharedAddressOf, sharedAddresses } from './sharedAddresses'

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

describe('mergeTarget', () => {
  it('keeps the person with a name — an admin profile is often written without one', () => {
    const [group] = sharedAddresses([
      { id: 'ga', personId: 'p-ga', email: 'g@example.fr', firstName: '', lastName: '', clubId: undefined, role: 'general_admin' as const },
      member('g-rix', 'p-g', 'g@example.fr', 'Gilles'),
    ])
    expect(mergeTarget(group).personId).toBe('p-g')
    expect(group.people.find((p) => p.personId === 'p-ga')!.profiles[0].generalAdmin).toBe(true)
  })

  it('then the person with more profiles', () => {
    const [group] = sharedAddresses([
      member('a', 'p-a', 'x@example.fr', 'Anne'),
      member('b1', 'p-b', 'x@example.fr', 'Bea'),
      member('b2', 'p-b', 'x@example.fr', 'Bea', 'club-b'),
    ])
    expect(mergeTarget(group).personId).toBe('p-b')
  })
})
