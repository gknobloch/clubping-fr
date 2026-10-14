import { describe, expect, it } from 'vitest'
import { namesakes, personMergeRefusal, personMergeTarget, personNameKey, similarPeople } from './namesakes'

// #731 — Landser's AGR list, imported beside the FFTT profiles of Rixheim.

const m = (id: string, personId: string, firstName: string, lastName: string, clubId?: string, email?: string) =>
  ({ id, personId, firstName, lastName, clubId, email })

describe('personNameKey', () => {
  it('reads accents, case and hyphens alike', () => {
    expect(personNameKey('Jean-Pierre', 'Séguy')).toBe(personNameKey('JEAN PIERRE', 'SEGUY'))
  })
})

describe('namesakes', () => {
  it('pairs the Landser profile with the Rixheim person who signs in', () => {
    const pairs = namesakes([
      m('enzo-lan', 'p-lan', 'Enzo', 'Lotz', 'landser'),
      m('enzo-rix', 'p-rix', 'Enzo', 'Lotz', 'rixheim', 'enzo@example.fr'),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].people.map((p) => p.personId)).toEqual(['p-rix', 'p-lan'])
  })

  it('leaves out one person, two addresses, a common club, and three of one name', () => {
    expect(namesakes([m('a', 'p', 'Enzo', 'Lotz', 'x'), m('b', 'p', 'Enzo', 'Lotz', 'y')])).toEqual([])
    expect(namesakes([
      m('a', 'p1', 'Enzo', 'Lotz', 'x', 'a@example.fr'), m('b', 'p2', 'Enzo', 'Lotz', 'y', 'b@example.fr'),
    ])).toEqual([])
    expect(namesakes([m('a', 'p1', 'Enzo', 'Lotz', 'x'), m('b', 'p2', 'Enzo', 'Lotz', 'x')])).toEqual([])
    expect(namesakes([
      m('a', 'p1', 'Enzo', 'Lotz', 'x'), m('b', 'p2', 'Enzo', 'Lotz', 'y'), m('c', 'p3', 'Enzo', 'Lotz', 'z'),
    ])).toEqual([])
  })
})

describe('personMergeTarget and personMergeRefusal', () => {
  const withAddress = { personId: 'a', email: 'a@example.fr', profiles: [{ userId: 'ua', clubId: 'x' }] }
  const without = { personId: 'b', profiles: [{ userId: 'ub', clubId: 'y' }, { userId: 'ub2', clubId: 'z' }] }

  it('keeps the address before the number of profiles', () => {
    expect(personMergeTarget(without, withAddress).keep.personId).toBe('a')
  })

  it('refuses to delete the side with the address', () => {
    expect(personMergeRefusal(without, withAddress)?.reason).toBe('keep_other')
    expect(personMergeRefusal(withAddress, without)).toBeNull()
  })
})

describe('similarPeople (#733)', () => {
  const p = (personId: string, firstName: string, lastName: string) => ({ personId, firstName, lastName, profiles: [] })
  it('finds the FFTT’s Rambeau for the AGR’s Rambeaux, the exact name first', () => {
    const rambeaux = p('lan', 'Vincent', 'Rambeaux')
    const people = [p('rix', 'Vincent', 'Rambeau'), p('x', 'Vincent', 'Rambeaux'), p('far', 'Vincent', 'Durand'), rambeaux]
    expect(similarPeople(rambeaux, people).map((x) => x.personId)).toEqual(['x', 'rix'])
  })

  it('stays strict on a short name', () => {
    expect(similarPeople(p('a', 'Li', 'Wu'), [p('b', 'Li', 'Xu')])).toEqual([])
  })
})
