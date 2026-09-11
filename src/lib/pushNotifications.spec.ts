import { describe, expect, it } from 'vitest'
import {
  AVAILABILITY_WINDOW_DAYS,
  availabilityChangePush,
  availabilityRequestPush,
  availabilityRequestsDue,
  captainsToAlert,
  daysUntil,
  inDays,
  longDate,
  sentKey,
  withinAvailabilityWindow,
  type GameLabels,
  type GameSquad,
} from './pushNotifications'

const TODAY = '2026-09-11'

const squad = (over: Partial<GameSquad> & Pick<GameSquad, 'gameId' | 'date'>): GameSquad => ({
  playerIds: ['alice', 'bob'],
  ...over,
})

describe('the window', () => {
  it('counts whole days regardless of the runtime timezone', () => {
    expect(daysUntil('2026-09-18', TODAY)).toBe(7)
    expect(daysUntil('2026-09-11', TODAY)).toBe(0)
    expect(daysUntil('2026-09-10', TODAY)).toBe(-1)
  })

  it('crosses a DST boundary without losing an hour', () => {
    // Europe/Paris falls back on 25 October 2026: 24 → 26 is two days, not
    // two days and an hour rounding to one.
    expect(daysUntil('2026-10-26', '2026-10-24')).toBe(2)
  })

  it('is undecidable for anything that is not a plain date', () => {
    expect(daysUntil('2026-09-18T20:00:00Z', TODAY)).toBeNull()
    expect(withinAvailabilityWindow('', TODAY)).toBe(false)
  })

  it('includes both ends — today and the seventh day', () => {
    expect(withinAvailabilityWindow(TODAY, TODAY)).toBe(true)
    expect(withinAvailabilityWindow('2026-09-18', TODAY)).toBe(true)
    expect(withinAvailabilityWindow('2026-09-19', TODAY)).toBe(false)
    expect(AVAILABILITY_WINDOW_DAYS).toBe(7)
  })

  it('never asks about a match already played', () => {
    expect(withinAvailabilityWindow('2026-09-10', TODAY)).toBe(false)
  })
})

describe('who is owed a reminder', () => {
  it('asks the whole squad, not only those who have not answered', () => {
    const due = availabilityRequestsDue(
      [squad({ gameId: 'g1', date: '2026-09-18' })],
      TODAY,
      new Set(),
    )
    expect(due).toEqual([
      { userId: 'alice', gameId: 'g1' },
      { userId: 'bob', gameId: 'g1' },
    ])
  })

  it('says nothing twice — the ledger is what makes the sweep idempotent', () => {
    const due = availabilityRequestsDue(
      [squad({ gameId: 'g1', date: '2026-09-18' })],
      TODAY,
      new Set([sentKey('alice', 'g1')]),
    )
    expect(due).toEqual([{ userId: 'bob', gameId: 'g1' }])
  })

  it('picks up a player added to the squad inside the window', () => {
    // The whole reason the rule is "who has not been told" rather than "which
    // matches are seven days out": three days before the match, Chloé joins a
    // squad whose D-7 sweep ran a week ago.
    const alreadyTold = new Set([sentKey('alice', 'g1'), sentKey('bob', 'g1')])
    const due = availabilityRequestsDue(
      [squad({ gameId: 'g1', date: '2026-09-14', playerIds: ['alice', 'bob', 'chloe'] })],
      TODAY,
      alreadyTold,
    )
    expect(due).toEqual([{ userId: 'chloe', gameId: 'g1' }])
  })

  it('owes two answers to someone playing twice the same day', () => {
    const due = availabilityRequestsDue(
      [
        squad({ gameId: 'g1', date: '2026-09-18', playerIds: ['alice'] }),
        squad({ gameId: 'g2', date: '2026-09-18', playerIds: ['alice'] }),
      ],
      TODAY,
      new Set(),
    )
    expect(due).toEqual([
      { userId: 'alice', gameId: 'g1' },
      { userId: 'alice', gameId: 'g2' },
    ])
  })

  it('sends one push for a licensee listed twice on the same roster', () => {
    const due = availabilityRequestsDue(
      [squad({ gameId: 'g1', date: '2026-09-18', playerIds: ['alice', 'alice'] })],
      TODAY,
      new Set(),
    )
    expect(due).toEqual([{ userId: 'alice', gameId: 'g1' }])
  })

  it('ignores squads outside the window entirely', () => {
    const due = availabilityRequestsDue(
      [
        squad({ gameId: 'far', date: '2026-10-03' }),
        squad({ gameId: 'past', date: '2026-09-04' }),
      ],
      TODAY,
      new Set(),
    )
    expect(due).toEqual([])
  })
})

describe('who hears about a change of mind', () => {
  const home = { id: 't-home', captainId: 'cap-home', playerIds: ['alice', 'bob'] }
  const away = { id: 't-away', captainId: 'cap-away', playerIds: ['zoe'] }

  it('tells the captain of the team the player is actually on', () => {
    expect(captainsToAlert([home, away], 'alice', 'alice')).toEqual(['cap-home'])
  })

  it('never tells the person who made the change', () => {
    // The captain overriding a player's answer from the composition screen is
    // the case this covers: being pushed your own tap is noise.
    expect(captainsToAlert([home, away], 'alice', 'cap-home')).toEqual([])
  })

  it('says nothing about a team with no captain', () => {
    expect(captainsToAlert([{ ...home, captainId: '' }], 'alice', 'alice')).toEqual([])
  })

  it('says nothing when the player is on neither roster', () => {
    expect(captainsToAlert([home, away], 'stranger', 'stranger')).toEqual([])
  })

  it('tells a captain once, even captaining both sides', () => {
    const both = [
      { ...home, captainId: 'cap' },
      { ...away, captainId: 'cap', playerIds: ['alice'] },
    ]
    expect(captainsToAlert(both, 'alice', 'alice')).toEqual(['cap'])
  })
})

describe('what the notifications say', () => {
  const labels: GameLabels = {
    gameId: 'g1',
    date: '2026-09-18',
    teamLabel: 'PPA Rixheim 3',
    opponentLabel: 'Mulhouse ASPTT 2',
    isHome: true,
  }

  it('formats the date in French, without a year', () => {
    expect(longDate('2026-09-18')).toBe('vendredi 18 septembre')
  })

  it('counts down in words', () => {
    expect(inDays(7)).toBe('dans 7 jours')
    expect(inDays(1)).toBe('demain')
    expect(inDays(0)).toBe("aujourd'hui")
  })

  it('names the team, the opponent and the urgency', () => {
    const push = availabilityRequestPush(labels, TODAY)
    expect(push.title).toBe('PPA Rixheim 3 — ta dispo ?')
    expect(push.body).toBe(
      'PPA Rixheim 3 reçoit Mulhouse ASPTT 2 vendredi 18 septembre, dans 7 jours. Indique ta disponibilité.',
    )
    expect(push.data.gameId).toBe('g1')
  })

  it('says "se déplace à" away from home', () => {
    const push = availabilityRequestPush({ ...labels, isHome: false }, TODAY)
    expect(push.body).toContain('PPA Rixheim 3 se déplace à Mulhouse ASPTT 2')
  })

  it('drops the clause rather than naming an opponent it could not resolve', () => {
    const push = availabilityRequestPush({ ...labels, opponentLabel: null }, TODAY)
    expect(push.body).toBe(
      'PPA Rixheim 3 vendredi 18 septembre, dans 7 jours. Indique ta disponibilité.',
    )
  })

  it("states the captain's message as a change, both values spelled out", () => {
    const push = availabilityChangePush(labels, 'Alice Martin', 'available', 'unavailable')
    expect(push.title).toBe('Alice Martin — indisponible')
    expect(push.body).toBe(
      'disponible → indisponible pour PPA Rixheim 3 reçoit Mulhouse ASPTT 2 vendredi 18 septembre.',
    )
    expect(push.data.gameId).toBe('g1')
  })
})
