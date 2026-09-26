import { describe, expect, it } from 'vitest'
import {
  competitionGroupOf,
  competitionRoster,
  competitionOfDivision,
  eligiblePlayers,
  isPlayerEligible,
  legacyCompetitionExclusions,
  playerEligibility,
  teamEligibility,
} from './competitionEligibility'
import type { Competition, CompetitionGroup, MemberGroup } from '../types'
import type { PlayerCategory } from './playerCategories'

// #482, #604 — who may play in which competition: its categories, AND the
// club's group for it when the club has set one.

const competition = (over: Partial<Competition> = {}): Competition => ({
  id: 'comp-seniors',
  displayName: 'Championnat par équipes',
  categories: [],
  sortOrder: 1,
  isArchived: false,
  ...over,
})

const youth = competition({
  id: 'comp-jeunes',
  displayName: 'Championnat jeunes',
  categories: ['P', 'B', 'M', 'C', 'J'],
  sortOrder: 2,
})

const cadet = { id: 'p-cadet', category: 'C1' }
const senior = { id: 'p-senior', category: 'S' }
const veteran = { id: 'p-veteran', category: 'V55' }
// Resolved, and found none — not the same as never resolved, which the type
// no longer lets a caller express.
const unknown = { id: 'p-unknown', category: undefined }

const seniors: MemberGroup = {
  id: 'g-seniors', clubId: 'club-1', displayName: 'Compétiteurs Seniors', memberIds: ['p-senior', 'p-cadet'],
}

describe('playerEligibility — the categories alone', () => {
  it('admits everyone to a competition that lists no category', () => {
    for (const p of [cadet, senior, veteran, unknown]) {
      expect(playerEligibility(p, competition())).toEqual({ eligible: true, reason: 'eligible' })
    }
  })

  it('admits a player whose category is listed, suffixes and all', () => {
    expect(isPlayerEligible(cadet, youth)).toBe(true)
  })

  it('turns away a player whose category is not, and says which of the two it is', () => {
    expect(playerEligibility(senior, youth)).toEqual({ eligible: false, reason: 'category_mismatch' })
    expect(playerEligibility(unknown, youth)).toEqual({ eligible: false, reason: 'no_category' })
  })
})

describe('playerEligibility — the club\'s group (#604)', () => {
  it('restricts a competition that lists no category to the group', () => {
    expect(playerEligibility(senior, competition(), seniors)).toEqual({ eligible: true, reason: 'eligible' })
    expect(playerEligibility(veteran, competition(), seniors)).toEqual({ eligible: false, reason: 'not_in_group' })
  })

  it('needs both: the category and the group', () => {
    expect(isPlayerEligible(cadet, youth, seniors)).toBe(true)
    expect(isPlayerEligible({ id: 'p-other-cadet', category: 'C2' }, youth, seniors)).toBe(false)
  })

  // The greyed row on the club screen: in the group, out of category. The
  // category is what the club has to see, not the group it is already in.
  it('says « hors catégorie » for a group member the categories turn away', () => {
    expect(playerEligibility(senior, youth, seniors)).toEqual({ eligible: false, reason: 'category_mismatch' })
  })

  it('never widens: a group cannot admit a category the competition refuses', () => {
    const everyone = { memberIds: ['p-senior', 'p-veteran', 'p-cadet', 'p-unknown'] }
    expect(eligiblePlayers([cadet, senior, veteran, unknown], youth, everyone)).toEqual([cadet])
  })
})

describe('eligiblePlayers', () => {
  it('filters a club list down to the competition and the group', () => {
    expect(eligiblePlayers([cadet, senior, veteran], competition(), seniors)).toEqual([cadet, senior])
  })

  it('restricts nobody when the division belongs to no competition', () => {
    const all = [cadet, senior, veteran]
    expect(eligiblePlayers(all, undefined, seniors)).toEqual(all)
  })
})

describe('competitionRoster — what the club screen lists (#604)', () => {
  const players = [cadet, senior, veteran, unknown]

  it('lists who the categories admit when the club set no group, and nothing greyed', () => {
    expect(competitionRoster(players, youth)).toEqual({ eligible: [cadet], outOfCategory: [] })
  })

  it('lists the group members the competition admits, and greys those it turns away', () => {
    const group = { memberIds: ['p-cadet', 'p-senior', 'p-unknown'] }
    expect(competitionRoster(players, youth, group)).toEqual({
      eligible: [cadet],
      outOfCategory: [
        { player: senior, reason: 'category_mismatch' },
        { player: unknown, reason: 'no_category' },
      ],
    })
  })

  // Nobody put them in the group, so nobody needs to be told why they are not in.
  it('does not grey someone who is simply outside the group', () => {
    expect(competitionRoster(players, competition(), seniors).outOfCategory).toEqual([])
  })
})

describe('competitionGroupOf', () => {
  const links: CompetitionGroup[] = [
    { clubId: 'club-1', competitionId: 'comp-seniors', groupId: 'g-seniors' },
    { clubId: 'club-1', competitionId: 'comp-jeunes', groupId: 'g-gone' },
    { clubId: 'club-2', competitionId: 'comp-jeunes', groupId: 'g-seniors' },
  ]

  it('finds the club\'s group for the competition', () => {
    expect(competitionGroupOf('club-1', 'comp-seniors', links, [seniors])).toBe(seniors)
  })

  it('reads another club\'s link for nothing', () => {
    expect(competitionGroupOf('club-3', 'comp-seniors', links, [seniors])).toBeUndefined()
  })

  // Deleting a group lifts the restriction rather than refusing everybody.
  it('reads a link to a group that no longer exists as no group', () => {
    expect(competitionGroupOf('club-1', 'comp-jeunes', links, [seniors])).toBeUndefined()
  })

  it('has nothing to say without a club', () => {
    expect(competitionGroupOf(undefined, 'comp-seniors', links, [seniors])).toBeUndefined()
  })
})

describe('competitionOfDivision', () => {
  const divisions = [
    { id: 'd-1', competitionId: 'comp-jeunes' },
    { id: 'd-2' },
    { id: 'd-3', competitionId: 'comp-gone' },
    { id: 'd-4', competitionId: 'comp-archived' },
    // Narrows its competition: benjamins and minimes only (#482).
    { id: 'd-5', competitionId: 'comp-jeunes', categories: ['B', 'M'] as PlayerCategory[] },
    // Widens it back to everyone, which an empty list is allowed to say.
    { id: 'd-6', competitionId: 'comp-jeunes', categories: [] as PlayerCategory[] },
  ]
  const competitions = [youth, competition({ id: 'comp-archived', isArchived: true })]

  it('finds it', () => {
    expect(competitionOfDivision('d-1', divisions, competitions)?.id).toBe('comp-jeunes')
  })

  // The more specific statement wins.
  it('lets a division narrow its competition, keeping the competition\'s identity', () => {
    const rule = competitionOfDivision('d-5', divisions, competitions)!
    expect(rule.categories).toEqual(['B', 'M'])
    // Still the championship's id: a club's group hangs off the competition.
    expect(rule.id).toBe('comp-jeunes')

    expect(isPlayerEligible(cadet, rule)).toBe(false)
    expect(isPlayerEligible({ id: 'p-benjamin', category: 'B2' }, rule)).toBe(true)
  })

  it('lets a division admit everyone where its competition would not', () => {
    const rule = competitionOfDivision('d-6', divisions, competitions)!
    expect(isPlayerEligible(senior, rule)).toBe(true)
  })

  it('inherits when the division says nothing', () => {
    expect(competitionOfDivision('d-1', divisions, competitions)?.categories)
      .toEqual(youth.categories)
  })

  it('is undefined for a division attached to none, to one that is gone, or to an archived one', () => {
    expect(competitionOfDivision('d-2', divisions, competitions)).toBeUndefined()
    expect(competitionOfDivision('d-3', divisions, competitions)).toBeUndefined()
    expect(competitionOfDivision('d-4', divisions, competitions)).toBeUndefined()
    expect(competitionOfDivision(undefined, divisions, competitions)).toBeUndefined()
  })
})

describe('teamEligibility', () => {
  const divisions = [{ id: 'd-sen', competitionId: 'comp-seniors' }, { id: 'd-free' }]
  const ctx = {
    divisions,
    competitions: [competition()],
    competitionGroups: [{ clubId: 'club-1', competitionId: 'comp-seniors', groupId: 'g-seniors' }],
    memberGroups: [seniors],
  }
  const team1 = { id: 't-1', clubId: 'club-1', divisionId: 'd-sen', playerIds: ['p-veteran'] }
  const team2 = { id: 't-2', clubId: 'club-1', divisionId: 'd-sen', playerIds: [] }
  const free = { id: 't-free', clubId: 'club-1', divisionId: 'd-free', playerIds: [] }
  // Another club in the same division: the link above is not theirs.
  const theirs = { id: 't-theirs', clubId: 'club-2', divisionId: 'd-sen', playerIds: [] }

  it('applies the team\'s own club\'s group', () => {
    const rule = teamEligibility([team1, team2, theirs], ctx)
    expect(rule.admits('t-2', senior)).toBe(true)
    expect(rule.admits('t-2', veteran)).toBe(false)
    expect(rule.admits('t-theirs', veteran)).toBe(true)
  })

  // Eligibility bites on what can be added, never on a squad already made.
  it('still lets a roster field whom it already holds', () => {
    const rule = teamEligibility([team1, team2], ctx)
    expect(rule.admits('t-1', veteran)).toBe(false)
    expect(rule.mayField('t-1', veteran)).toBe(true)
    expect(rule.mayField('t-2', veteran)).toBe(false)
  })

  it('restricts nobody in a division filed under no competition', () => {
    expect(teamEligibility([free], ctx).admits('t-free', veteran)).toBe(true)
  })
})

// The shim for app ≤ 1.5 (#604): its copy of the rule reads these rows, and an
// `excluded` one beats everything in it.
describe('legacyCompetitionExclusions', () => {
  const players = [
    { id: 'p-senior', clubId: 'club-1' },
    { id: 'p-cadet', clubId: 'club-1' },
    { id: 'p-veteran', clubId: 'club-1' },
    { id: 'p-elsewhere', clubId: 'club-2' },
  ]

  it('excludes every member of the club outside the group, and no one else', () => {
    const rows = legacyCompetitionExclusions(
      [{ clubId: 'club-1', competitionId: 'comp-seniors', groupId: 'g-seniors' }], [seniors], players,
    )
    expect(rows).toEqual([
      { clubId: 'club-1', competitionId: 'comp-seniors', playerId: 'p-veteran', effect: 'excluded' },
    ])
  })

  // A member of the group whose category does not fit gets no row — the old
  // rule already turns them away by category, as the new one does.
  it('leaves category mismatches to the categories, as the new rule does', () => {
    const rows = legacyCompetitionExclusions(
      [{ clubId: 'club-1', competitionId: 'comp-jeunes', groupId: 'g-seniors' }], [seniors], players,
    )
    expect(rows.map((r) => r.playerId)).toEqual(['p-veteran'])
    expect(isPlayerEligible(senior, youth, seniors)).toBe(false)
  })

  it('says nothing for a competition with no group, or a group that is gone', () => {
    expect(legacyCompetitionExclusions([], [seniors], players)).toEqual([])
    expect(legacyCompetitionExclusions(
      [{ clubId: 'club-1', competitionId: 'comp-seniors', groupId: 'g-gone' }], [seniors], players,
    )).toEqual([])
  })
})
