import { describe, expect, it } from 'vitest'
import {
  canClubAdd,
  competitionOfDivision,
  eligibleCompetitions,
  eligiblePlayers,
  isPlayerEligible,
  playerEligibility,
} from './competitionEligibility'
import type { Competition, CompetitionEligibility } from '../types'
import type { PlayerCategory } from './playerCategories'

const competition = (over: Partial<Competition> = {}): Competition => ({
  id: 'comp-seniors',
  displayName: 'Championnat par équipes',
  categories: [],
  isCategoryLocked: false,
  sortOrder: 1,
  isArchived: false,
  ...over,
})

const youth = competition({
  id: 'comp-jeunes',
  displayName: 'Championnat jeunes',
  categories: ['P', 'B', 'M', 'C', 'J'],
  isCategoryLocked: true,
  sortOrder: 2,
})

const veterans = competition({
  id: 'comp-veterans',
  displayName: 'Championnat vétérans',
  categories: ['V50', 'V55', 'V60'],
  sortOrder: 3,
})

const override = (
  competitionId: string,
  playerId: string,
  effect: 'included' | 'excluded',
): CompetitionEligibility => ({ clubId: 'club-1', competitionId, playerId, effect })

const cadet = { id: 'p-cadet', category: 'C1' }
const senior = { id: 'p-senior', category: 'S' }
const veteran = { id: 'p-veteran', category: 'V55' }
const unknown = { id: 'p-unknown' }

describe('playerEligibility — the default mapping (#482)', () => {
  it('admits everyone to a competition that lists no category', () => {
    for (const p of [cadet, senior, veteran, unknown]) {
      expect(playerEligibility(p, competition(), [])).toEqual({ eligible: true, reason: 'category' })
    }
  })

  it('admits a player whose category is listed', () => {
    expect(playerEligibility(cadet, youth, [])).toEqual({ eligible: true, reason: 'category' })
    expect(playerEligibility(veteran, veterans, [])).toEqual({ eligible: true, reason: 'category' })
  })

  it('turns away a player whose category is not, and says which of the two it is', () => {
    expect(playerEligibility(senior, youth, [])).toEqual({
      eligible: false, reason: 'category_mismatch',
    })
    expect(playerEligibility(unknown, youth, [])).toEqual({
      eligible: false, reason: 'no_category',
    })
  })

  // A cadet plays in their own category and with the adults — which is why
  // eligibility is a list and never a field on the player.
  it('lets one player belong to several competitions at once', () => {
    const all = [competition(), youth, veterans]
    expect(eligibleCompetitions(cadet, all, []).map((c) => c.id))
      .toEqual(['comp-seniors', 'comp-jeunes'])
    expect(eligibleCompetitions(veteran, all, []).map((c) => c.id))
      .toEqual(['comp-seniors', 'comp-veterans'])
  })

  it('never offers an archived competition', () => {
    expect(eligibleCompetitions(senior, [competition({ isArchived: true })], [])).toEqual([])
  })
})

describe('playerEligibility — what a club amends', () => {
  it('excludes a licensee the default would have admitted', () => {
    expect(playerEligibility(veteran, veterans, [override('comp-veterans', 'p-veteran', 'excluded')]))
      .toEqual({ eligible: false, reason: 'club_excluded' })
  })

  it('adds a licensee the default would have turned away', () => {
    expect(playerEligibility(senior, veterans, [override('comp-veterans', 'p-senior', 'included')]))
      .toEqual({ eligible: true, reason: 'club_added' })
  })

  it('says "par sa catégorie" for an addition the default already covered', () => {
    expect(playerEligibility(veteran, veterans, [override('comp-veterans', 'p-veteran', 'included')]))
      .toEqual({ eligible: true, reason: 'category' })
  })

  it('reads only the overrides of the competition at hand', () => {
    expect(isPlayerEligible(veteran, veterans, [override('comp-jeunes', 'p-veteran', 'excluded')]))
      .toBe(true)
  })
})

describe('a locked competition', () => {
  it('cannot be widened by a club', () => {
    expect(canClubAdd(youth, senior)).toBe(false)
    expect(canClubAdd(youth, cadet)).toBe(true)
    expect(canClubAdd(veterans, senior)).toBe(true)
  })

  // The API refuses to write such a row; this does not rely on that, because
  // locking a competition after the fact must not leave stale additions standing.
  it('voids an addition that predates the lock', () => {
    expect(playerEligibility(senior, youth, [override('comp-jeunes', 'p-senior', 'included')]))
      .toEqual({ eligible: false, reason: 'category_mismatch' })
  })

  it('still lets a club exclude', () => {
    expect(playerEligibility(cadet, youth, [override('comp-jeunes', 'p-cadet', 'excluded')]))
      .toEqual({ eligible: false, reason: 'club_excluded' })
  })
})

describe('eligiblePlayers', () => {
  it('filters a club list down to the competition', () => {
    expect(eligiblePlayers([cadet, senior, veteran, unknown], youth, []).map((p) => p.id))
      .toEqual(['p-cadet'])
  })

  it('restricts nobody when the division belongs to no competition', () => {
    const all = [cadet, senior, veteran, unknown]
    expect(eligiblePlayers(all, undefined, [])).toEqual(all)
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
    // Still the championship's id and lock: derogations hang off the
    // competition, and the lock is the championship's policy.
    expect(rule.id).toBe('comp-jeunes')
    expect(rule.isCategoryLocked).toBe(true)

    expect(isPlayerEligible(cadet, rule, [])).toBe(false)
    expect(isPlayerEligible({ id: 'p-benjamin', category: 'B2' }, rule, [])).toBe(true)
  })

  it('lets a division admit everyone where its competition would not', () => {
    const rule = competitionOfDivision('d-6', divisions, competitions)!
    expect(isPlayerEligible(senior, rule, [])).toBe(true)
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
