import { describe, it, expect } from 'vitest'
import type { MemberGroup } from '@/types'
import {
  clubMemberGroups, groupDeletionMessage, groupNameTaken, groupsOfMember, inlineGroupChips, mayManageMemberGroups,
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

describe('inlineGroupChips', () => {
  const g = (id: string, displayName: string): MemberGroup => ({ id, clubId: 'c1', displayName, memberIds: [] })
  // Ten groups, as a well-organised club has them — alphabetical already.
  const TEN = [
    'Arbitres', 'Baby-ping', 'Bureau', 'Comité', 'Compétiteurs Jeunes', 'Compétiteurs Seniors',
    'Entraîneurs', 'Féminines', 'Loisirs', 'Vétérans',
  ].map((name, i) => g(`g${i}`, name))

  it('shows every group, and no « +N », when they all fit', () => {
    const three = TEN.slice(0, 3)
    expect(inlineGroupChips(three, [])).toEqual({ inline: three, hidden: 0 })
  })

  it('folds what does not fit into « +N », in alphabetical order', () => {
    const { inline, hidden } = inlineGroupChips(TEN, [])
    // « Compétiteurs Jeunes » does not fit, so nothing after it shows either —
    // not even the shorter « Entraîneurs », which would leave a gap.
    expect(inline.map((x) => x.displayName)).toEqual(['Arbitres', 'Baby-ping', 'Bureau', 'Comité'])
    expect(hidden).toBe(6)
  })

  // The row is how the list says what it is filtered on.
  it('always gives a chosen group its chip, in its alphabetical place', () => {
    const { inline, hidden } = inlineGroupChips(TEN, ['g9'])
    expect(inline.map((x) => x.displayName)).toEqual([
      'Arbitres', 'Baby-ping', 'Bureau', 'Comité', 'Vétérans',
    ])
    expect(hidden).toBe(5)
  })

  it('does not grow the row when the chosen group was already showing', () => {
    expect(inlineGroupChips(TEN, ['g0']).inline).toHaveLength(4)
  })

  // Choosing « Test de groupe qui a un grand nom » from the sheet must not add a
  // third line: the unchosen groups make room for it instead.
  const LONG = [...TEN, g('g10', 'Test de groupe qui a un grand nom')]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'))

  it('makes room for a long chosen group by folding unchosen ones', () => {
    const { inline, hidden } = inlineGroupChips(LONG, ['g4', 'g10'])
    // « Compétiteurs Jeunes » (24) and the long one (38) leave room for 8:
    // « Arbitres » (13) does not fit, so no unchosen group shows at all.
    expect(inline.map((x) => x.displayName)).toEqual([
      'Compétiteurs Jeunes', 'Test de groupe qui a un grand nom',
    ])
    expect(hidden).toBe(9)
  })

  it('shows every chosen group when they alone overflow, and nothing else', () => {
    const { inline, hidden } = inlineGroupChips(LONG, ['g4', 'g5', 'g10'])
    expect(inline.map((x) => x.displayName)).toEqual([
      'Compétiteurs Jeunes', 'Compétiteurs Seniors', 'Test de groupe qui a un grand nom',
    ])
    expect(hidden).toBe(8)
  })

  it('fills what the chosen ones leave, alphabetically, with no gap', () => {
    // Vétérans (13) leaves 57: Arbitres, Baby-ping, Bureau and Comité (49),
    // then « Compétiteurs Jeunes » (24) does not fit — and neither does
    // anything after it, however short.
    const { inline } = inlineGroupChips(TEN, ['g9'])
    expect(inline.map((x) => x.displayName)).toEqual([
      'Arbitres', 'Baby-ping', 'Bureau', 'Comité', 'Vétérans',
    ])
  })
})

describe('groupDeletionMessage (#604)', () => {
  const comps = [{ id: 'comp-1', displayName: 'Championnat jeunes' }, { id: 'comp-2', displayName: 'Coupe' }]

  it('says only that nobody leaves the club when nothing is reserved to it', () => {
    expect(groupDeletionMessage(bureau, [], comps)).toBe('Ses membres restent au club : seul le groupe disparaît.')
  })

  it('names the competition that opens back up', () => {
    expect(groupDeletionMessage(bureau, [{ clubId: 'c1', competitionId: 'comp-1', groupId: 'g-bureau' }], comps))
      .toContain('« Championnat jeunes » lui est réservée : elle redeviendra ouverte à toutes ses catégories.')
  })

  it('names them all, and reads another club\'s link for nothing', () => {
    const msg = groupDeletionMessage(bureau, [
      { clubId: 'c1', competitionId: 'comp-1', groupId: 'g-bureau' },
      { clubId: 'c1', competitionId: 'comp-2', groupId: 'g-bureau' },
      { clubId: 'c2', competitionId: 'comp-2', groupId: 'g-bureau' },
    ], comps)
    expect(msg).toContain('« Championnat jeunes », « Coupe » lui sont réservées')
  })
})
