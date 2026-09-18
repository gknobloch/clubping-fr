import { describe, expect, it } from 'vitest'
import {
  answerOverride, fixtureOverride, mayAnswerFor, mayAnswerOnFixture, mayManageTeam,
  type AuthorityPlayer, type AuthorityTeam, type AuthorityViewer,
} from './teamAuthority'

// #569 — the rule the screens have held since #462, now stated once so the API
// can ask it too. What these tests pin down is the difference between the two
// halves: who runs a team, and who may speak for a licensee.

const CLUB = 'club-a'
const OTHER = 'club-b'

const team = (over: Partial<AuthorityTeam> = {}): AuthorityTeam =>
  ({ id: 'team-1', clubId: CLUB, captainId: 'cap', ...over })

const player = (over: Partial<AuthorityPlayer> = {}): AuthorityPlayer =>
  ({ id: 'p1', clubId: CLUB, ...over })

const viewer = (over: Partial<AuthorityViewer> & Pick<AuthorityViewer, 'id'>): AuthorityViewer =>
  ({ role: 'player', clubId: CLUB, ...over })

const captain = viewer({ id: 'cap' })
const clubAdmin = viewer({ id: 'ca', role: 'club_admin' })
const otherClubAdmin = viewer({ id: 'ca2', role: 'club_admin', clubId: OTHER })
const generalAdmin = viewer({ id: 'ga', role: 'general_admin', clubId: undefined })
const teammate = viewer({ id: 'p2' })

describe('mayManageTeam — who runs a team', () => {
  it('admits the captain of that team', () => {
    expect(mayManageTeam(captain, team())).toBe(true)
  })

  it('admits the club admin of that team', () => {
    expect(mayManageTeam(clubAdmin, team())).toBe(true)
  })

  it("refuses another club's admin", () => {
    expect(mayManageTeam(otherClubAdmin, team())).toBe(false)
  })

  it('refuses a player who captains nothing', () => {
    expect(mayManageTeam(teammate, team())).toBe(false)
  })

  // The web's canEditGameSelection omitted this and the app's canManageTeam
  // allowed it; the app's is the documented intent.
  it('admits a general admin, on any club', () => {
    expect(mayManageTeam(generalAdmin, team())).toBe(true)
    expect(mayManageTeam(generalAdmin, team({ clubId: OTHER }))).toBe(true)
  })

  // Captaincy is per-team, so captaining team 1 says nothing about team 2.
  it('refuses a captain on a team they do not captain', () => {
    expect(mayManageTeam(captain, team({ id: 'team-2', captainId: 'someone-else' }))).toBe(false)
  })
})

describe('mayAnswerFor — who may speak for a licensee', () => {
  it('lets a player answer for themselves', () => {
    expect(mayAnswerFor(viewer({ id: 'p1' }), team(), player())).toBe(true)
  })

  // Wherever they play: their own answer needs no team to authorise it, which
  // is what keeps a renfort able to reply on a team whose roster lacks them.
  it("lets a player answer for themselves even on another club's team", () => {
    expect(mayAnswerFor(viewer({ id: 'p1' }), team({ clubId: OTHER }), player())).toBe(true)
  })

  it('lets the captain answer for a licensee of their club', () => {
    expect(mayAnswerFor(captain, team(), player())).toBe(true)
  })

  it('lets the club admin answer for a licensee of their club', () => {
    expect(mayAnswerFor(clubAdmin, team(), player())).toBe(true)
  })

  // "Autres joueurs du club": the roster is not the question, the club is.
  it('does not require the licensee to be on the roster', () => {
    expect(mayAnswerFor(captain, team(), player({ id: 'not-in-squad' }))).toBe(true)
  })

  // The conjunct the screens left implicit — without it a club admin answers
  // for the opposition on their own fixtures.
  it("refuses a club admin answering for the opposing club's licensee", () => {
    expect(mayAnswerFor(clubAdmin, team(), player({ clubId: OTHER }))).toBe(false)
  })

  it("refuses a captain answering for another club's licensee", () => {
    expect(mayAnswerFor(captain, team(), player({ clubId: OTHER }))).toBe(false)
  })

  it('refuses a team-mate', () => {
    expect(mayAnswerFor(teammate, team(), player())).toBe(false)
  })

  // The whole point of keeping this apart from mayManageTeam (#462).
  it('refuses a general admin, who answers for nobody', () => {
    expect(mayAnswerFor(generalAdmin, team(), player())).toBe(false)
    expect(mayManageTeam(generalAdmin, team())).toBe(true)
  })
})

describe('answerOverride — what gets recorded', () => {
  it('records nothing when the player answers for themselves', () => {
    expect(answerOverride(viewer({ id: 'p1' }), team(), player())).toBeUndefined()
  })

  it('records the captain', () => {
    expect(answerOverride(captain, team(), player())).toBe('captain')
  })

  it('records the club admin', () => {
    expect(answerOverride(clubAdmin, team(), player())).toBe('club_admin')
  })

  it('records nothing for somebody with no standing, as mayAnswerFor refuses them', () => {
    expect(answerOverride(teammate, team(), player())).toBeUndefined()
    expect(answerOverride(generalAdmin, team(), player())).toBeUndefined()
  })
})

// The API sees a fixture, not a team: no team id travels with an availability.
describe('a fixture, where the team is not named', () => {
  const home = team({ id: 'home', clubId: CLUB, captainId: 'cap' })
  const away = team({ id: 'away', clubId: OTHER, captainId: 'cap-b' })
  const fixture = [home, away]

  it('admits through either side', () => {
    expect(mayAnswerOnFixture(clubAdmin, fixture, player())).toBe(true)
    expect(mayAnswerOnFixture(otherClubAdmin, fixture, player({ clubId: OTHER }))).toBe(true)
  })

  it('still refuses across the fixture: one club may not answer for the other', () => {
    expect(mayAnswerOnFixture(clubAdmin, fixture, player({ clubId: OTHER }))).toBe(false)
    expect(mayAnswerOnFixture(otherClubAdmin, fixture, player())).toBe(false)
  })

  it('admits a player of neither roster answering for themselves', () => {
    expect(mayAnswerOnFixture(viewer({ id: 'p1' }), fixture, player())).toBe(true)
  })

  it('refuses a stranger to both clubs', () => {
    const outsider = viewer({ id: 'x', role: 'club_admin', clubId: 'club-c' })
    expect(mayAnswerOnFixture(outsider, fixture, player())).toBe(false)
  })

  it('reads the override off whichever side grants it', () => {
    expect(fixtureOverride(clubAdmin, fixture, player())).toBe('club_admin')
    expect(fixtureOverride(viewer({ id: 'p1' }), fixture, player())).toBeUndefined()
  })

  // A club admin who also captains a team is recorded as the captain they are.
  it('prefers captain over club_admin when both sides would answer', () => {
    const playingAdmin = viewer({ id: 'cap', role: 'club_admin' })
    expect(fixtureOverride(playingAdmin, fixture, player())).toBe('captain')
  })
})
