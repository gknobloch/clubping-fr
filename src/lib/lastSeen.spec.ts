import { describe, it, expect } from 'vitest'
import { formatLastSeen, hasVisited, NEVER_LABEL } from './lastSeen'

/** A fixed "now" so the labels do not depend on the day the suite runs. */
const NOW = new Date(2026, 7, 17, 14, 30) // 17 August 2026, local time

/** An ISO timestamp `days` before NOW, at a time of day that is not midnight. */
const daysBefore = (days: number, hour = 9) =>
  new Date(2026, 7, 17 - days, hour, 15).toISOString()

describe('formatLastSeen', () => {
  it('says Jamais when the member has never signed in', () => {
    expect(formatLastSeen(undefined, NOW)).toBe(NEVER_LABEL)
  })

  it('says Jamais rather than "Invalid Date" for an unparseable timestamp', () => {
    expect(formatLastSeen('not-a-date', NOW)).toBe(NEVER_LABEL)
  })

  it('counts calendar days, not elapsed hours', () => {
    // 23h55 yesterday is "Hier" even though it is under 24 hours ago; 00h05
    // today is "Aujourd'hui" even though the visit before it was closer.
    expect(formatLastSeen(new Date(2026, 7, 16, 23, 55).toISOString(), NOW)).toBe('Hier')
    expect(formatLastSeen(new Date(2026, 7, 17, 0, 5).toISOString(), NOW)).toBe("Aujourd'hui")
  })

  it('counts the days up to a week', () => {
    expect(formatLastSeen(daysBefore(2), NOW)).toBe('Il y a 2 jours')
    expect(formatLastSeen(daysBefore(6), NOW)).toBe('Il y a 6 jours')
  })

  it('switches to weeks, singular at one', () => {
    expect(formatLastSeen(daysBefore(7), NOW)).toBe('Il y a 1 semaine')
    expect(formatLastSeen(daysBefore(13), NOW)).toBe('Il y a 1 semaine')
    expect(formatLastSeen(daysBefore(14), NOW)).toBe('Il y a 2 semaines')
    expect(formatLastSeen(daysBefore(27), NOW)).toBe('Il y a 3 semaines')
  })

  it('becomes a French date once the visit is four weeks old', () => {
    expect(formatLastSeen(daysBefore(28), NOW)).toBe('20 juillet 2026')
  })

  it('reads a visit dated in the future as today rather than a negative delay', () => {
    expect(formatLastSeen(daysBefore(-3), NOW)).toBe("Aujourd'hui")
  })
})

describe('hasVisited', () => {
  it('is false for a member with no recorded visit', () => {
    expect(hasVisited(undefined)).toBe(false)
  })

  it('is true for any recorded visit', () => {
    expect(hasVisited(daysBefore(400))).toBe(true)
  })
})
