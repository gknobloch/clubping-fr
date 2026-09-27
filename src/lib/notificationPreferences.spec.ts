import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFERENCES, leadDaysLabel, mergePreferences, parsePreferences,
  resolveNotificationPreferences, sanitizePreferencesPatch,
} from './notificationPreferences'

// #608 — what a member wants pushed, per category.

describe('resolveNotificationPreferences', () => {
  it('defaults to matches and guided sessions on, regular slots off, three days ahead', () => {
    expect(resolveNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(DEFAULT_NOTIFICATION_PREFERENCES.training_guided).toEqual({ enabled: true, leadDays: 3 })
    expect(DEFAULT_NOTIFICATION_PREFERENCES.training_regular).toEqual({ enabled: false, leadDays: 3 })
  })

  it('lays a member\'s own choices over the defaults', () => {
    const p = resolveNotificationPreferences({ training_regular: { enabled: true }, training_guided: { leadDays: 1 } })
    expect(p.training_regular).toEqual({ enabled: true, leadDays: 3 })
    expect(p.training_guided).toEqual({ enabled: true, leadDays: 1 })
  })

  it('never lets a match lead move — the seven days are the captain\'s', () => {
    expect(resolveNotificationPreferences({ match: { enabled: false, leadDays: 2 } }).match)
      .toEqual({ enabled: false, leadDays: 7 })
  })
})

describe('sanitizePreferencesPatch', () => {
  it('drops unknown categories and malformed values rather than refusing', () => {
    expect(sanitizePreferencesPatch({
      training_guided: { enabled: 'yes', leadDays: 4 },
      training_regular: { enabled: true, leadDays: 5 },
      match: { leadDays: 3 },
      tournaments: { enabled: true },
    })).toEqual({ training_regular: { enabled: true, leadDays: 5 } })
    expect(sanitizePreferencesPatch(null)).toEqual({})
    expect(sanitizePreferencesPatch('nope')).toEqual({})
  })
})

describe('stored column', () => {
  it('reads NULL and garbage as every default', () => {
    expect(parsePreferences(null)).toEqual({})
    expect(parsePreferences('{not json')).toEqual({})
    expect(parsePreferences('{"match":{"enabled":false}}')).toEqual({ match: { enabled: false } })
  })

  it('merges a change into one category without losing the other half of it', () => {
    const stored = { training_guided: { enabled: false, leadDays: 5 } }
    expect(mergePreferences(stored, { training_guided: { enabled: true } }))
      .toEqual({ training_guided: { enabled: true, leadDays: 5 } })
  })
})

it('names the lead in words', () => {
  expect(leadDaysLabel(1)).toBe('La veille')
  expect(leadDaysLabel(3)).toBe('3 jours avant')
})
