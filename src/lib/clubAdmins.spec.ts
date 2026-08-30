import { describe, it, expect } from 'vitest'
import {
  MAX_CLUB_ADMINS,
  canAddClubAdmin,
  canManageClubAdmins,
  canRemoveClubAdmin,
  clubAdminsOf,
  isClubAdminOf,
  refusalMessage,
  remainingClubAdminSlots,
} from './clubAdmins'

const CLUB = 'club-fftt-06680011'
const OTHER = 'club-fftt-06680105'

const admin = (id: string, clubId = CLUB) => ({ id, role: 'club_admin', clubId, status: 'active' })
const player = (id: string, clubId = CLUB) => ({ id, role: 'player', clubId, status: 'active' })

/** A club with `n` admins, plus a player and someone from another club. */
const clubWith = (n: number) => [
  ...Array.from({ length: n }, (_, i) => admin(`a${i}`)),
  player('p1'),
  admin('other-admin', OTHER),
]

const generalAdmin = { id: 'g1', role: 'general_admin' }
const clubAdmin = { id: 'a0', role: 'club_admin', clubId: CLUB }

describe('clubAdminsOf (#474)', () => {
  it('keeps the admins of this club only — not its players, not another club’s admins', () => {
    expect(clubAdminsOf(clubWith(2), CLUB).map((a) => a.id)).toEqual(['a0', 'a1'])
  })

  it('is empty for a club nobody administers', () => {
    expect(clubAdminsOf(clubWith(0), CLUB)).toEqual([])
  })

  // A promoted player keeps playing: the role says who administers, is_player
  // says who plays, and this module must not conflate them.
  it('counts a promoted player as an admin', () => {
    const users = [{ id: 'p1', role: 'club_admin', clubId: CLUB, status: 'active' }]
    expect(isClubAdminOf(users[0], CLUB)).toBe(true)
    expect(isClubAdminOf(users[0], OTHER)).toBe(false)
  })
})

describe('canManageClubAdmins (#474)', () => {
  it('admits a general admin anywhere', () => {
    expect(canManageClubAdmins(generalAdmin, CLUB)).toBe(true)
    expect(canManageClubAdmins(generalAdmin, OTHER)).toBe(true)
  })

  it('admits a club admin in their own club only', () => {
    expect(canManageClubAdmins(clubAdmin, CLUB)).toBe(true)
    expect(canManageClubAdmins(clubAdmin, OTHER)).toBe(false)
  })

  it('refuses a player, a captain’s club, and nobody at all', () => {
    expect(canManageClubAdmins({ id: 'p1', role: 'player', clubId: CLUB }, CLUB)).toBe(false)
    expect(canManageClubAdmins(null, CLUB)).toBe(false)
    expect(canManageClubAdmins(undefined, CLUB)).toBe(false)
  })
})

describe('canAddClubAdmin (#474)', () => {
  it('admits a player of the club, below the cap', () => {
    expect(canAddClubAdmin(clubWith(1), CLUB, player('p1'), clubAdmin)).toEqual({ ok: true })
  })

  it('admits a member with no club at all — the non-licensee just invited', () => {
    const invited = { id: 'new', role: 'player', clubId: undefined, status: 'active' }
    expect(canAddClubAdmin(clubWith(1), CLUB, invited, clubAdmin)).toEqual({ ok: true })
  })

  it(`refuses the ${MAX_CLUB_ADMINS + 1}th`, () => {
    expect(canAddClubAdmin(clubWith(MAX_CLUB_ADMINS), CLUB, player('p1'), clubAdmin)).toEqual({
      ok: false,
      reason: 'full',
    })
  })

  it('admits the last free slot, so the cap is 5 and not 4', () => {
    expect(canAddClubAdmin(clubWith(MAX_CLUB_ADMINS - 1), CLUB, player('p1'), clubAdmin)).toEqual({
      ok: true,
    })
  })

  it('refuses someone who already administers the club', () => {
    expect(canAddClubAdmin(clubWith(2), CLUB, admin('a0'), clubAdmin)).toEqual({
      ok: false,
      reason: 'already_admin',
    })
  })

  it('refuses a general admin, whose reach would shrink to one club', () => {
    expect(canAddClubAdmin(clubWith(1), CLUB, { id: 'g1', role: 'general_admin' }, generalAdmin)).toEqual({
      ok: false,
      reason: 'general_admin',
    })
  })

  it('refuses a member of another club rather than moving them', () => {
    expect(canAddClubAdmin(clubWith(1), CLUB, player('x', OTHER), generalAdmin)).toEqual({
      ok: false,
      reason: 'other_club',
    })
  })

  it('refuses an archived member', () => {
    expect(
      canAddClubAdmin(clubWith(1), CLUB, { ...player('p1'), status: 'archived' }, clubAdmin),
    ).toEqual({ ok: false, reason: 'archived' })
  })

  it('refuses a club admin reaching into a club that is not theirs', () => {
    expect(canAddClubAdmin(clubWith(1), OTHER, player('p1', OTHER), clubAdmin)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })

  // Order matters where two refusals apply: being told the club is full when
  // the real problem is that you may not touch it at all leaks its state.
  it('reports the permission refusal ahead of the cap', () => {
    expect(canAddClubAdmin(clubWith(MAX_CLUB_ADMINS), CLUB, player('p1'), null)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })
})

describe('canRemoveClubAdmin (#474)', () => {
  it('stands down one admin among several', () => {
    expect(canRemoveClubAdmin(clubWith(2), CLUB, 'a1', clubAdmin)).toEqual({ ok: true })
  })

  it('lets an admin stand themselves down while another remains', () => {
    expect(canRemoveClubAdmin(clubWith(2), CLUB, 'a0', clubAdmin)).toEqual({ ok: true })
  })

  it('refuses the last one, leaving nobody to administer the club', () => {
    expect(canRemoveClubAdmin(clubWith(1), CLUB, 'a0', clubAdmin)).toEqual({
      ok: false,
      reason: 'last_admin',
    })
  })

  // The rule is about the club being left empty, not about who is asking: a
  // general admin stranding a club is the same outcome.
  it('refuses the last one to a general admin too', () => {
    expect(canRemoveClubAdmin(clubWith(1), CLUB, 'a0', generalAdmin)).toEqual({
      ok: false,
      reason: 'last_admin',
    })
  })

  it('refuses someone who does not administer the club', () => {
    expect(canRemoveClubAdmin(clubWith(2), CLUB, 'p1', clubAdmin)).toEqual({
      ok: false,
      reason: 'not_an_admin',
    })
    expect(canRemoveClubAdmin(clubWith(2), CLUB, 'other-admin', clubAdmin)).toEqual({
      ok: false,
      reason: 'not_an_admin',
    })
  })

  it('refuses a club admin reaching into another club', () => {
    expect(canRemoveClubAdmin(clubWith(2), OTHER, 'other-admin', clubAdmin)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })
})

describe('remainingClubAdminSlots (#474)', () => {
  it('counts down to zero and never below', () => {
    expect(remainingClubAdminSlots(clubWith(0), CLUB)).toBe(MAX_CLUB_ADMINS)
    expect(remainingClubAdminSlots(clubWith(3), CLUB)).toBe(2)
    expect(remainingClubAdminSlots(clubWith(MAX_CLUB_ADMINS), CLUB)).toBe(0)
    expect(remainingClubAdminSlots(clubWith(MAX_CLUB_ADMINS + 2), CLUB)).toBe(0)
  })
})

describe('refusalMessage (#474)', () => {
  it('has French wording for every refusal', () => {
    const reasons = [
      'not_allowed', 'full', 'already_admin', 'general_admin',
      'other_club', 'archived', 'email_taken', 'not_an_admin', 'last_admin',
    ] as const
    for (const r of reasons) expect(refusalMessage(r)).toMatch(/\S/)
  })

  it('states the actual cap, so the number cannot drift from the rule', () => {
    expect(refusalMessage('full')).toContain(String(MAX_CLUB_ADMINS))
  })
})
