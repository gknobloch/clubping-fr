import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain ESM script, no type declarations by design
import {
  shiftDate,
  nextSaturday,
  journeeDates,
  isDemoId,
  assertDemoOnly,
  DEMO_USER,
  DEMO_AVAILABILITY,
} from './demo-data.mjs'

// ---------------------------------------------------------------------------
// The demo club's calendar (#520)
//
// The dates are not the subject — the OFFSETS are. A calendar written with
// fixed dates goes stale by definition, which is how the demo club ended up
// with a journée on 18 May 2030: somebody needed "prochaines journées" to
// stop emptying.
//
// The guard is tested harder than anything else here, because this script
// writes to production and the club next door is real.
// ---------------------------------------------------------------------------

describe('shiftDate', () => {
  it('moves forward and back in whole days', () => {
    expect(shiftDate('2026-09-13', 7)).toBe('2026-09-20')
    expect(shiftDate('2026-09-13', -14)).toBe('2026-08-30')
  })

  it('crosses a month and a DST boundary without losing a day', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
    // Europe/Paris falls back on 25 October 2026.
    expect(shiftDate('2026-10-24', 2)).toBe('2026-10-26')
  })
})

describe('nextSaturday', () => {
  it.each([
    ['2026-09-13', '2026-09-19'], // a Sunday → six days out
    ['2026-09-18', '2026-09-19'], // a Friday → tomorrow
  ])('from %s lands on %s', (today, expected) => {
    expect(nextSaturday(today)).toBe(expected)
    expect(new Date(`${expected}T00:00:00Z`).getUTCDay()).toBe(6)
  })

  it('run on a Saturday, anchors the NEXT one', () => {
    // Otherwise the script would call today's match "still to come", and the
    // Accueil screen would advertise a fixture being played that afternoon.
    expect(nextSaturday('2026-09-19')).toBe('2026-09-26')
  })
})

describe('journeeDates', () => {
  const today = '2026-09-13'
  const dates = journeeDates(today)

  it('puts one journée behind today and two ahead', () => {
    expect(dates[1] < today).toBe(true)
    expect(dates[2] > today).toBe(true)
    expect(dates[3] > dates[2]).toBe(true)
  })

  it('puts journée 2 inside the coming week — the whole point', () => {
    // The Accueil hero card, the availability prompts and the line-up all
    // hang off a match being close.
    const days = (Date.parse(`${dates[2]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
    expect(days).toBeGreaterThan(0)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('leaves a fortnight between journées', () => {
    expect(shiftDate(dates[1], 14)).toBe(dates[2])
    expect(shiftDate(dates[2], 14)).toBe(dates[3])
  })

  it('never produces the same calendar twice from different days', () => {
    expect(journeeDates('2026-09-13')[2]).not.toBe(journeeDates('2026-09-20')[2])
  })
})

describe('the production guard', () => {
  it('accepts the demo club and the review account', () => {
    expect(isDemoId('demo-team-1')).toBe(true)
    expect(isDemoId('demo-md-1-2')).toBe(true)
    expect(isDemoId(DEMO_USER)).toBe(true)
  })

  it('rejects a real club, whose members play actual matches', () => {
    expect(isDemoId('team-06680011-27-1-5')).toBe(false)
    expect(isDemoId('club-fftt-06680011')).toBe(false)
    expect(isDemoId('p2-player-24')).toBe(false)
  })

  it('is not fooled by a name that merely contains "demo"', () => {
    expect(isDemoId('club-demo-fftt-1234')).toBe(false)
    expect(isDemoId('user-demo-someone-else')).toBe(false)
  })

  it('throws, naming what it refused', () => {
    expect(() => assertDemoOnly(['demo-team-1', 'team-06680011-27-1-5'])).toThrow(
      'team-06680011-27-1-5',
    )
  })

  it('passes a set that is entirely the demo club', () => {
    expect(() => assertDemoOnly(['demo-team-1', 'demo-g-1-2', DEMO_USER])).not.toThrow()
  })
})

describe('the squad’s answers for the coming match', () => {
  const statuses = Object.values(DEMO_AVAILABILITY) as string[]
  const count = (s: string) => statuses.filter((v) => v === s).length

  it('shows all three states at once', () => {
    // An empty panel — "0 disponibles · 6 sans réponse" — is what the screen
    // looks like when nobody uses the feature. A spread is the only way the
    // three states, and the count a captain reads, appear at all.
    expect(count('available')).toBe(3)
    expect(count('maybe')).toBe(1)
    expect(count('unavailable')).toBe(1)
  })

  it('leaves somebody silent, which is a state and not a value', () => {
    // "Sans réponse" is the ABSENCE of a row. The squad is six; five answer.
    expect(Object.keys(DEMO_AVAILABILITY)).toHaveLength(5)
  })

  it('has the captain answer for himself', () => {
    // Otherwise "Ma disponibilité" is blank on the first screen anyone sees.
    expect(DEMO_AVAILABILITY[DEMO_USER]).toBe('available')
  })

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(Object.keys(DEMO_AVAILABILITY))).not.toThrow()
  })

  it('uses only statuses the app understands', () => {
    for (const s of statuses) expect(['available', 'maybe', 'unavailable']).toContain(s)
  })
})
