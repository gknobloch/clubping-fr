import { describe, it, expect } from 'vitest'
import type { MemberGroup } from '@/types'
import {
  clubMemberGroups, groupNameTaken, groupsOfMember, mayManageMemberGroups,
  memberGroupFilter, normalizeGroupName, withGroupMembers, withMemberGroups,
} from './memberGroups'

// #602 — a club's own groups of members, and the filter the players list
// builds from them.

const bureau: MemberGroup = { id: 'g-bureau', clubId: 'c1', displayName: 'Bureau', memberIds: ['a', 'b'] }
const jeunes: MemberGroup = { id: 'g-jeunes', clubId: 'c1', displayName: 'jeunes', memberIds: ['b', 'c'] }
const elsewhere: MemberGroup = { id: 'g-far', clubId: 'c2', displayName: 'Arbitres', memberIds: ['a'] }
const ALL = [jeunes, elsewhere, bureau]

describe('mayManageMemberGroups', () => {
  it('admits a general admin anywhere and a club admin at home only', () => {
    expect(mayManageMemberGroups({ role: 'general_admin' }, 'c1')).toBe(true)
    expect(mayManageMemberGroups({ role: 'club_admin', clubId: 'c1' }, 'c1')).toBe(true)
    expect(mayManageMemberGroups({ role: 'club_admin', clubId: 'c2' }, 'c1')).toBe(false)
    expect(mayManageMemberGroups({ role: 'player', clubId: 'c1' }, 'c1')).toBe(false)
    expect(mayManageMemberGroups(null, 'c1')).toBe(false)
  })

  it('refuses a club admin when no club is named', () => {
    expect(mayManageMemberGroups({ role: 'club_admin', clubId: 'c1' }, undefined)).toBe(false)
  })
})

describe('clubMemberGroups / groupsOfMember', () => {
  it('lists one club, alphabetically and regardless of case', () => {
    expect(clubMemberGroups(ALL, 'c1').map((g) => g.id)).toEqual(['g-bureau', 'g-jeunes'])
    expect(clubMemberGroups(ALL, undefined)).toEqual([])
  })

  it('lists what a member belongs to, across every group it is given', () => {
    expect(groupsOfMember(ALL, 'b').map((g) => g.id)).toEqual(['g-bureau', 'g-jeunes'])
    expect(groupsOfMember(ALL, 'a').map((g) => g.id)).toEqual(['g-far', 'g-bureau'])
    expect(groupsOfMember(ALL, 'z')).toEqual([])
  })
})

describe('memberGroupFilter', () => {
  const ids = ['a', 'b', 'c', 'd']
  const run = (selected: string[], mode: 'any' | 'all') =>
    ids.filter(memberGroupFilter(ALL, selected, mode))

  it('keeps everybody when nothing is chosen, in either mode', () => {
    expect(run([], 'any')).toEqual(ids)
    expect(run([], 'all')).toEqual(ids)
  })

  it('OU keeps whoever is in at least one chosen group', () => {
    expect(run(['g-bureau', 'g-jeunes'], 'any')).toEqual(['a', 'b', 'c'])
  })

  it('ET keeps only whoever is in every chosen group', () => {
    expect(run(['g-bureau', 'g-jeunes'], 'all')).toEqual(['b'])
  })

  it('agrees with itself on a single group', () => {
    expect(run(['g-jeunes'], 'any')).toEqual(run(['g-jeunes'], 'all'))
  })

  // Deleted from another device while chosen here: silently emptying the list
  // under ET for a chip nobody can see any more would be worse than ignoring it.
  it('ignores a chosen id that no longer exists', () => {
    expect(run(['g-bureau', 'g-gone'], 'all')).toEqual(['a', 'b'])
    expect(run(['g-gone'], 'all')).toEqual(ids)
  })
})

describe('group names', () => {
  it('folds the spaces a phone keyboard leaves behind', () => {
    expect(normalizeGroupName('  Équipe   loisirs ')).toBe('Équipe loisirs')
  })

  it('finds a clash within the club, ignoring case and spacing', () => {
    expect(groupNameTaken(ALL, 'c1', ' BUREAU ')).toBe(true)
    expect(groupNameTaken(ALL, 'c1', 'Jeunes')).toBe(true)
    expect(groupNameTaken(ALL, 'c1', 'Loisirs')).toBe(false)
  })

  it('lets another club use the same name', () => {
    expect(groupNameTaken(ALL, 'c2', 'Bureau')).toBe(false)
  })

  it('lets a group keep its own name when renamed', () => {
    expect(groupNameTaken(ALL, 'c1', 'bureau', 'g-bureau')).toBe(false)
  })
})

describe('membership updates', () => {
  it('replaces one group\'s members, without duplicates', () => {
    const next = withGroupMembers(ALL, 'g-bureau', ['c', 'c', 'd'])
    expect(next.find((g) => g.id === 'g-bureau')?.memberIds).toEqual(['c', 'd'])
    expect(next.find((g) => g.id === 'g-jeunes')).toBe(jeunes)
  })

  it('files a member into exactly the groups chosen, within their club', () => {
    const next = withMemberGroups(ALL, 'c1', 'a', ['g-jeunes'])
    expect(next.find((g) => g.id === 'g-bureau')?.memberIds).toEqual(['b'])
    expect(next.find((g) => g.id === 'g-jeunes')?.memberIds).toEqual(['b', 'c', 'a'])
    // Another club's group is not this club's to empty.
    expect(next.find((g) => g.id === 'g-far')).toBe(elsewhere)
  })

  it('leaves a group untouched when nothing about it changes', () => {
    const next = withMemberGroups(ALL, 'c1', 'b', ['g-bureau', 'g-jeunes'])
    expect(next.find((g) => g.id === 'g-bureau')).toBe(bureau)
  })
})
