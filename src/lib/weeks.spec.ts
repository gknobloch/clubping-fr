import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { todayIso, getMondayOf, getSundayOf } from './weeks'

// ---------------------------------------------------------------------------
// #561 — every date this app compares is a *civil* date: a game's, a journée's,
// the one a member reads off the card. "Today" has to be one too.
//
// The bug these tests hold is invisible in a UTC runner, which is what CI is,
// so they pin a French clock: `toISOString()` converts to UTC first, and east
// of Greenwich that makes the first hour or two of every day read as yesterday.
// ---------------------------------------------------------------------------
const originalTz = process.env.TZ

beforeAll(() => { process.env.TZ = 'Europe/Paris' })
afterAll(() => { process.env.TZ = originalTz })

describe('todayIso', () => {
  it('is the local calendar day, not the UTC one, just after midnight', () => {
    vi.useFakeTimers()
    try {
      // 00:30 on Friday 18 September in Rixheim — still 22:30 on Thursday in UTC.
      vi.setSystemTime(new Date('2026-09-17T22:30:00Z'))
      expect(todayIso()).toBe('2026-09-18')
    } finally {
      vi.useRealTimers()
    }
  })

  it('agrees with the UTC day for the rest of the day', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-18T07:00:00Z'))
      expect(todayIso()).toBe('2026-09-18')
    } finally {
      vi.useRealTimers()
    }
  })

  it('crosses into the new year on local midnight', () => {
    vi.useFakeTimers()
    try {
      // 00:05 on 1 January in Paris; 23:05 on 31 December in UTC.
      vi.setSystemTime(new Date('2025-12-31T23:05:00Z'))
      expect(todayIso()).toBe('2026-01-01')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getMondayOf / getSundayOf', () => {
  it('keeps a Monday to itself and pairs it with its Sunday', () => {
    expect(getMondayOf('2026-09-14')).toBe('2026-09-14')
    expect(getSundayOf('2026-09-14')).toBe('2026-09-20')
  })

  it('walks a mid-week day back to its Monday', () => {
    // Thursday 17 September 2026.
    expect(getMondayOf('2026-09-17')).toBe('2026-09-14')
  })

  it('reads Sunday as the end of the week it closes, not the start of the next', () => {
    expect(getMondayOf('2026-09-20')).toBe('2026-09-14')
  })

  it('crosses a month and a year boundary', () => {
    expect(getMondayOf('2026-10-01')).toBe('2026-09-28')
    expect(getSundayOf('2025-12-29')).toBe('2026-01-04')
  })
})
