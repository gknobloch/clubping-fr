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
  DEMO_PROFILE,
  DEMO_IDENTITY,
  DEMO_LAST_SEEN,
  KICK_OFF,
  KICK_OFF_DAY,
  DEMO_LINEUP,
  DEMO_PLAYED_LINEUP,
  PLAYED_JOURNEE,
  UPCOMING_JOURNEE,
} from './demo-data.mjs'
import { normalizeCategory } from '../src/lib/playerCategories'

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

describe('what Camille Durand’s fiche shows', () => {
  const entries = Object.entries(
    DEMO_PROFILE as Record<string, { category: string; phone: string }>,
  )

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(entries.map(([id]) => id))).not.toThrow()
  })

  it('uses a category the app can read back', () => {
    // Stored verbatim and normalised on read (#482): a code nothing recognises
    // normalises to undefined, and the fiche prints nothing at all — which is
    // exactly the empty screen this is here to avoid.
    for (const [, { category }] of entries) {
      expect(normalizeCategory(category)).toBe(category)
    }
  })

  it('uses a phone number nobody can answer', () => {
    // ARCEP reserves 07 99 98 xx xx for fiction, the way +1 555-0100 is
    // reserved. This one goes on a public store listing, so "looks invented"
    // is not enough — it has to be unallocated.
    for (const [, { phone }] of entries) {
      expect(phone.replace(/\D/g, '')).toMatch(/^3379998\d{4}$/)
    }
  })
})

describe('the review account’s own line', () => {
  it('carries a classement, like every one of its team-mates', () => {
    // The ten demo players run 905 to 1520; a blank here is the one gap on the
    // Accueil card and at the head of the squad it captains.
    const points = Number(DEMO_IDENTITY.points)
    expect(points).toBeGreaterThan(900)
    expect(points).toBeLessThan(1600)
  })

  it('states it as text, which is what the column holds', () => {
    // FFTT sends a string and nothing here does arithmetic on it; a number
    // would be coerced on the way in and read back differently.
    expect(typeof DEMO_IDENTITY.points).toBe('string')
  })
})

describe('the club looks alive', () => {
  const days = Object.values(DEMO_LAST_SEEN) as number[]

  it('gives every member a visit', () => {
    // The absence of one renders as "Jamais connecté", and eleven of those
    // down the Joueurs list advertise a club that does not use the app.
    expect(Object.keys(DEMO_LAST_SEEN).length).toBeGreaterThanOrEqual(11)
    expect(days.every((d) => Number.isInteger(d) && d >= 0)).toBe(true)
  })

  it('keeps them inside the relative-wording window', () => {
    // Past 28 days src/lib/lastSeen.ts prints a bare date, which reads as a
    // record rather than as activity.
    expect(Math.max(...days)).toBeLessThan(28)
  })

  it('spreads them, rather than stamping one day on everybody', () => {
    expect(new Set(days).size).toBeGreaterThan(3)
    expect(Math.min(...days)).toBe(0)
  })

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(Object.keys(DEMO_LAST_SEEN))).not.toThrow()
  })
})

describe('the declared slot and the fixtures agree', () => {
  it('states the same hour the games carry', () => {
    // The team screen prints the team's DECLARED slot under « Calendrier »;
    // the fixtures under it carry the game's own time. Setting only the games
    // left that card saying 17h00 over a match at 16h00.
    expect(KICK_OFF).toBe('16h00')
    expect(KICK_OFF_DAY).toBe('Samedi')
  })
})

// ---------------------------------------------------------------------------
// The journée already played (#598)
//
// Left undeclared, it drifted: seed-demo.sql puts four players on it and
// production held five, so the journées matrix — one of the eight store
// screenshots — printed « Résumé — Compo 5/4 » in red onto both listings.
// That is the impossible line-up #583 added the row to catch, illustrating
// the feature by failing it.
//
// The size is the defect, so the size is what is pinned. The two names are
// pinned as well, because each carries a screen somewhere else in the set and
// a well-meaning edit would take it away silently.
// ---------------------------------------------------------------------------

describe('the journée already played', () => {
  it('fields exactly what the division asks for — the 5/4 is the bug', () => {
    expect(DEMO_PLAYED_LINEUP).toHaveLength(4)
  })

  it('names nobody twice', () => {
    expect(new Set(DEMO_PLAYED_LINEUP).size).toBe(DEMO_PLAYED_LINEUP.length)
  })

  it('names only demo rows — this writes to production', () => {
    for (const id of DEMO_PLAYED_LINEUP) expect(isDemoId(id)).toBe(true)
  })

  it('keeps Camille Durand, whose brûlage needs both matches', () => {
    // computeBrulage counts two games across the club's teams; her badge is
    // the subject of screenshots 06 and 07.
    expect(DEMO_PLAYED_LINEUP).toContain('demo-player-2')
    expect(DEMO_LINEUP).toContain('demo-player-2')
  })

  it('keeps the review account, so his card still reads « 1/1 » and not « 0/1 »', () => {
    expect(DEMO_PLAYED_LINEUP).toContain(DEMO_USER)
  })

  it('is a different journée from the one being composed', () => {
    expect(PLAYED_JOURNEE).not.toBe(UPCOMING_JOURNEE)
  })

  it('sits in the past of the calendar the offsets build', () => {
    const dates = journeeDates('2026-09-20')
    expect(dates[PLAYED_JOURNEE] < dates[UPCOMING_JOURNEE]).toBe(true)
  })
})
