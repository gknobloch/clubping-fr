import { describe, it, expect } from 'vitest'
import type { MemberGroup, Training, TrainingAvailability, TrainingSession } from '@/types'
import {
  addDays, answerCounts, answerTally, upcomingSessionsFor, moreSessionsLabel, accueilColumn, mayManageSchedule, buildTrainingEvent,
  seriesCalendarDates, seriesCalendarPath, trainingEventUid, audienceLabel, cancellationsDue, expectedMemberIds, formatTime, formatTimeRange,
  isoWeekday, occurrenceKey, parseOccurrenceKey, recurrenceLabel, trainingCancelledPush, trainingRefusal,
  validateTrainingDraft, withAddedDates, withAnswer, withSessionState, trainingAddress, placeLabel, weeklyDates, sessionDates, sessionDatesHint,
  trainingOccurrences, trainingReminderPush, trainingRemindersDue, upcomingOccurrences,
  type OccurrenceAudience,
} from './trainings'
import { resolveNotificationPreferences, type NotificationPreferences } from './notificationPreferences'

// #608 — a club's collective trainings: series into dates, who is expected,
// and who is owed a reminder.

const mardi: Training = {
  id: 't-mardi', clubId: 'c1', kind: 'regular', displayName: 'Entraînement libre',
  weekday: 2, startTime: '20:00', endTime: '22:00', memberGroupIds: [], managerIds: [],
}
const dirige: Training = {
  id: 't-dirige', clubId: 'c1', kind: 'guided', displayName: 'Dirigé jeunes',
  startTime: '18:30', memberGroupIds: ['g-jeunes'], managerIds: ['coach'],
}

describe('dates', () => {
  it('knows the ISO weekday of a civil date', () => {
    expect(isoWeekday('2026-09-29')).toBe(2) // mardi
    expect(isoWeekday('2026-10-04')).toBe(7) // dimanche
  })

  it('moves across a month end', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02')
  })

  it('writes times the way the app writes a match time', () => {
    expect(formatTime('20:00')).toBe('20h')
    expect(formatTime('18:30')).toBe('18h30')
    expect(formatTime('08:00')).toBe('8h')
    expect(formatTimeRange(mardi)).toBe('20h – 22h')
    expect(recurrenceLabel(mardi)).toBe('Tous les mardis, 20h – 22h')
  })

  it('round-trips an occurrence key whatever the id holds', () => {
    const key = occurrenceKey('training-17-3-abc', '2026-09-29')
    expect(parseOccurrenceKey(key)).toEqual({ trainingId: 'training-17-3-abc', date: '2026-09-29' })
    expect(parseOccurrenceKey('nope')).toBeNull()
    expect(parseOccurrenceKey('x@2026-13-45')).toBeNull()
  })
})

describe('trainingOccurrences', () => {
  it('expands a regular slot to its weekday, and nothing else', () => {
    const occ = trainingOccurrences([mardi], [], '2026-09-26', '2026-10-13')
    expect(occ.map((o) => o.date)).toEqual(['2026-09-29', '2026-10-06', '2026-10-13'])
    expect(occ.every((o) => !o.cancelled)).toBe(true)
  })

  it('keeps a regular slot inside its own period', () => {
    const bounded = { ...mardi, validFrom: '2026-10-01', validUntil: '2026-10-10' }
    expect(trainingOccurrences([bounded], [], '2026-09-01', '2026-12-31').map((o) => o.date))
      .toEqual(['2026-10-06'])
  })

  it('merges an exception into the date it names, and ignores one for a date the slot has not', () => {
    const sessions: TrainingSession[] = [
      { trainingId: 't-mardi', date: '2026-10-06', cancelled: true, note: 'Gymnase fermé' },
      { trainingId: 't-mardi', date: '2026-10-07', cancelled: true },
    ]
    const occ = trainingOccurrences([mardi], sessions, '2026-09-26', '2026-10-13')
    expect(occ.map((o) => [o.date, o.cancelled, o.note])).toEqual([
      ['2026-09-29', false, undefined],
      ['2026-10-06', true, 'Gymnase fermé'],
      ['2026-10-13', false, undefined],
    ])
  })

  it('reads a guided series off its rows alone — no row, no session', () => {
    const sessions: TrainingSession[] = [
      { trainingId: 't-dirige', date: '2026-10-01', cancelled: false },
      { trainingId: 't-dirige', date: '2026-10-15', cancelled: true },
      { trainingId: 't-dirige', date: '2027-01-01', cancelled: false },
    ]
    expect(trainingOccurrences([dirige], sessions, '2026-09-26', '2026-10-31').map((o) => [o.date, o.cancelled]))
      .toEqual([['2026-10-01', false], ['2026-10-15', true]])
  })

  it('sorts by date, then time', () => {
    const sessions: TrainingSession[] = [{ trainingId: 't-dirige', date: '2026-09-29', cancelled: false }]
    const occ = trainingOccurrences([mardi, dirige], sessions, '2026-09-29', '2026-09-29')
    expect(occ.map((o) => o.training.id)).toEqual(['t-dirige', 't-mardi'])
  })

  it('lists far ahead — a coach\'s December, and every Tuesday past October', () => {
    const sessions: TrainingSession[] = [
      { trainingId: 't-dirige', date: '2026-12-10', cancelled: false },
      { trainingId: 't-dirige', date: '2027-12-01', cancelled: false },
    ]
    const occ = upcomingOccurrences({ trainings: [mardi, dirige], trainingSessions: sessions }, 'c1', '2026-09-26')
    expect(occ.filter((o) => o.training.kind === 'guided').map((o) => o.date)).toEqual(['2026-12-10'])
    const tuesdays = occ.filter((o) => o.training.kind === 'regular').map((o) => o.date)
    expect(tuesdays).toContain('2026-11-03')
    // A year of an open-ended slot, and no more.
    expect(tuesdays).toHaveLength(52)
  })

  it('lists one club only', () => {
    const other = { ...mardi, id: 't-other', clubId: 'c2' }
    const occ = upcomingOccurrences({ trainings: [mardi, other], trainingSessions: [] }, 'c1', '2026-09-26')
    expect(new Set(occ.map((o) => o.training.id))).toEqual(new Set(['t-mardi']))
    expect(upcomingOccurrences({ trainings: [mardi], trainingSessions: [] }, undefined, '2026-09-26')).toEqual([])
  })
})

describe('who is expected', () => {
  const groups: MemberGroup[] = [
    { id: 'g-jeunes', clubId: 'c1', displayName: 'Jeunes', memberIds: ['a', 'president', 'gone', 'far'] },
    { id: 'g-loisirs', clubId: 'c1', displayName: 'Loisirs', memberIds: ['b'] },
  ]
  const members = [
    { id: 'a', clubId: 'c1', isPlayer: true, status: 'active' },
    { id: 'b', clubId: 'c1', isPlayer: true, status: 'active' },
    { id: 'president', clubId: 'c1', isPlayer: false },
    { id: 'gone', clubId: 'c1', isPlayer: true, status: 'archived' },
    { id: 'far', clubId: 'c2', isPlayer: true, status: 'active' },
  ]

  it('takes the named groups, non-players included, archived and other clubs not', () => {
    expect(expectedMemberIds(dirige, groups, members)).toEqual(['a', 'president'])
  })

  it('falls back to the club\'s active licensees when no group is named', () => {
    expect(expectedMemberIds(mardi, groups, members)).toEqual(['a', 'b'])
  })

  it('says who a training is for in words', () => {
    expect(audienceLabel(mardi, groups)).toBe('Tout le club')
    expect(audienceLabel({ memberGroupIds: ['g-loisirs', 'g-jeunes'] }, groups)).toBe('Jeunes, Loisirs')
  })

  it('counts answers over the members expected, and no one else', () => {
    const answers: TrainingAvailability[] = [
      { trainingId: 't-dirige', date: '2026-10-01', playerId: 'a', status: 'available' },
      { trainingId: 't-dirige', date: '2026-10-01', playerId: 'left-the-group', status: 'available' },
      { trainingId: 't-dirige', date: '2026-10-08', playerId: 'b', status: 'maybe' },
    ]
    expect(answerCounts(answers, 't-dirige', '2026-10-01', ['a', 'b', 'c']))
      .toEqual({ available: 1, maybe: 0, unavailable: 0, none: 2 })
  })

  it('says the tally in one line, zeros left out', () => {
    expect(answerTally({ available: 3, maybe: 1, unavailable: 0, none: 4 })).toBe('3 oui · 1 peut-être · 4 sans réponse')
    expect(answerTally({ available: 0, maybe: 0, unavailable: 0, none: 0 })).toBe('Personne n’est attendu')
  })
})

describe('trainingRemindersDue', () => {
  const defaults = resolveNotificationPreferences(null)
  const prefs = (overrides: Record<string, NotificationPreferences> = {}) =>
    (userId: string) => overrides[userId] ?? defaults
  const guided = (date: string, memberIds = ['a', 'b'], cancelled = false): OccurrenceAudience => ({
    key: occurrenceKey('t-dirige', date), kind: 'guided', date, cancelled, memberIds,
  })
  const regular = (date: string, memberIds = ['a']): OccurrenceAudience => ({
    key: occurrenceKey('t-mardi', date), kind: 'regular', date, cancelled: false, memberIds,
  })
  const today = '2026-09-26'

  it('reminds a guided session three days ahead by default, not four', () => {
    expect(trainingRemindersDue([guided('2026-09-29')], prefs(), today, new Set()).map((d) => d.userId))
      .toEqual(['a', 'b'])
    expect(trainingRemindersDue([guided('2026-09-30')], prefs(), today, new Set())).toEqual([])
  })

  it('stays quiet about regular slots unless the member asked', () => {
    expect(trainingRemindersDue([regular('2026-09-29')], prefs(), today, new Set())).toEqual([])
    const wants = resolveNotificationPreferences({ training_regular: { enabled: true } })
    expect(trainingRemindersDue([regular('2026-09-29')], prefs({ a: wants }), today, new Set()))
      .toEqual([{ userId: 'a', key: occurrenceKey('t-mardi', '2026-09-29') }])
  })

  it('honours each member\'s own lead', () => {
    const eve = resolveNotificationPreferences({ training_guided: { leadDays: 1 } })
    const due = trainingRemindersDue([guided('2026-09-28')], prefs({ a: eve }), today, new Set())
    expect(due.map((d) => d.userId)).toEqual(['b'])
    expect(trainingRemindersDue([guided('2026-09-27')], prefs({ a: eve }), today, new Set()).map((d) => d.userId))
      .toEqual(['a', 'b'])
  })

  it('never reminds on the day, nor of a cancelled session, nor twice', () => {
    expect(trainingRemindersDue([guided(today)], prefs(), today, new Set())).toEqual([])
    expect(trainingRemindersDue([guided('2026-09-28', ['a'], true)], prefs(), today, new Set())).toEqual([])
    const sent = new Set([`a ${occurrenceKey('t-dirige', '2026-09-28')}`])
    expect(trainingRemindersDue([guided('2026-09-28')], prefs(), today, sent).map((d) => d.userId)).toEqual(['b'])
  })

  it('skips a member who switched the category off', () => {
    const off = resolveNotificationPreferences({ training_guided: { enabled: false } })
    expect(trainingRemindersDue([guided('2026-09-28')], prefs({ a: off }), today, new Set()).map((d) => d.userId))
      .toEqual(['b'])
  })
})

describe('cancellationsDue', () => {
  const defaults = resolveNotificationPreferences(null)
  const off: OccurrenceAudience = {
    key: occurrenceKey('t-dirige', '2026-09-28'), kind: 'guided', date: '2026-09-28', cancelled: true, memberIds: ['a', 'b', 'c'],
  }

  it('tells whoever was counting on it, once, and nobody else', () => {
    const counting = new Map([[off.key, new Set(['a', 'b'])]])
    const sent = new Set([`b ${off.key}`])
    expect(cancellationsDue([off], counting, () => defaults, '2026-09-26', sent)).toEqual([{ userId: 'a', key: off.key }])
  })

  it('still tells on the day, never after', () => {
    const counting = new Map([[off.key, new Set(['a'])]])
    expect(cancellationsDue([off], counting, () => defaults, '2026-09-28', new Set())).toHaveLength(1)
    expect(cancellationsDue([off], counting, () => defaults, '2026-09-29', new Set())).toEqual([])
  })

  it('ignores a session still on', () => {
    const on = { ...off, cancelled: false }
    expect(cancellationsDue([on], new Map([[on.key, new Set(['a'])]]), () => defaults, '2026-09-26', new Set())).toEqual([])
  })
})

describe('messages', () => {
  const labels = {
    trainingId: 't-dirige', kind: 'guided' as const, displayName: 'Dirigé jeunes',
    date: '2026-09-29', startTime: '18:30', place: 'Gymnase Jean-Moulin',
  }

  it('asks a guided session\'s audience whether they are coming', () => {
    const m = trainingReminderPush(labels, '2026-09-26')
    expect(m.title).toBe('Dirigé jeunes')
    expect(m.body).toBe('mardi 29 septembre à 18h30 à Gymnase Jean-Moulin, dans 3 jours. Indique si tu viens.')
    expect(m.data).toEqual({ kind: 'training_reminder', trainingId: 't-dirige', date: '2026-09-29' })
  })

  it('only states a regular slot', () => {
    const m = trainingReminderPush({ ...labels, kind: 'regular', place: undefined }, '2026-09-28')
    expect(m.body).toBe('mardi 29 septembre à 18h30, demain.')
  })

  it('says a session is off, with the reason when there is one', () => {
    const m = trainingCancelledPush({ ...labels, note: 'Salle prise pour le tournoi.' })
    expect(m.title).toBe('Annulé — Dirigé jeunes')
    expect(m.body).toBe('Dirigé jeunes, mardi 29 septembre à 18h30 : séance annulée. Salle prise pour le tournoi.')
  })
})

describe('local writes', () => {
  it('adds dates without duplicating or restoring one', () => {
    const sessions: TrainingSession[] = [{ trainingId: 't-dirige', date: '2026-10-01', cancelled: true }]
    expect(withAddedDates(sessions, 't-dirige', ['2026-10-01', '2026-10-08', '2026-10-08'])).toEqual([
      { trainingId: 't-dirige', date: '2026-10-01', cancelled: true },
      { trainingId: 't-dirige', date: '2026-10-08', cancelled: false },
    ])
  })

  it('keeps a regular exception only while it says something', () => {
    const on = withSessionState([], mardi, '2026-09-29', { cancelled: true, note: ' Fermé ' })
    expect(on).toEqual([{ trainingId: 't-mardi', date: '2026-09-29', cancelled: true, note: 'Fermé' }])
    expect(withSessionState(on, mardi, '2026-09-29', { cancelled: false, note: '' })).toEqual([])
  })

  it('never creates a guided date by cancelling it', () => {
    expect(withSessionState([], dirige, '2026-10-01', { cancelled: true })).toEqual([])
  })

  it('sets and withdraws an answer', () => {
    const one = withAnswer([], 't-dirige', '2026-10-01', 'a', 'maybe')
    expect(withAnswer(one, 't-dirige', '2026-10-01', 'a', 'available')).toEqual([
      { trainingId: 't-dirige', date: '2026-10-01', playerId: 'a', status: 'available' },
    ])
    expect(withAnswer(one, 't-dirige', '2026-10-01', 'a', null)).toEqual([])
  })

  it('refuses what the API refuses, in words', () => {
    const base = { kind: 'regular' as const, displayName: 'Libre', weekday: 2, startTime: '20:00', memberGroupIds: [], managerIds: [] }
    expect(validateTrainingDraft(base)).toBeNull()
    expect(validateTrainingDraft({ ...base, displayName: ' ' })).toMatch(/nom/)
    expect(validateTrainingDraft({ ...base, endTime: '19:00' })).toMatch(/horaires/)
    expect(validateTrainingDraft({ ...base, weekday: undefined })).toMatch(/jour/)
    expect(validateTrainingDraft({ ...base, kind: 'guided', weekday: undefined })).toBeNull()
    expect(trainingRefusal('bad_time')).toMatch(/horaires/)
    expect(trainingRefusal('weird')).toMatch(/Réessayez/)
  })
})

describe('place and weekly runs', () => {
  const club = {
    id: 'c1', affiliationNumber: '', displayName: 'PPA', isArchived: false, channels: [],
    addresses: [
      { id: 'a1', label: 'Gymnase', street: '', postalCode: '', city: 'Rixheim', isDefault: false },
      { id: 'a2', label: '', street: '', postalCode: '', city: 'Habsheim', isDefault: true },
    ],
  }

  it('reads the address a training names, else the club\'s default', () => {
    expect(placeLabel(trainingAddress({ clubId: 'c1', addressId: 'a1' }, [club]))).toBe('Gymnase')
    expect(placeLabel(trainingAddress({ clubId: 'c1' }, [club]))).toBe('Habsheim')
    expect(placeLabel(trainingAddress({ clubId: 'c2' }, [club]))).toBeUndefined()
  })

  it('lays a weekly run of dates, one date when no end is given', () => {
    expect(weeklyDates('2026-10-01', '2026-10-20')).toEqual(['2026-10-01', '2026-10-08', '2026-10-15'])
    expect(weeklyDates('2026-10-01')).toEqual(['2026-10-01'])
    expect(weeklyDates('2026-10-01', '2026-09-01')).toEqual(['2026-10-01'])
    expect(weeklyDates('2026-01-01', '2030-01-01')).toHaveLength(52)
    expect(weeklyDates('bad')).toEqual([])
  })
})

describe('upcomingSessionsFor', () => {
  const groups: MemberGroup[] = [{ id: 'g-jeunes', clubId: 'c1', displayName: 'Jeunes', memberIds: ['a'] }]
  const members = [
    { id: 'a', clubId: 'c1', isPlayer: true, status: 'active' },
    { id: 'b', clubId: 'c1', isPlayer: true, status: 'active' },
  ]
  const data = (sessions: TrainingSession[]) => ({ trainings: [mardi, dirige], trainingSessions: sessions, memberGroups: groups })

  it('gives every session of one kind, cancelled ones included', () => {
    const d = data([
      { trainingId: 't-dirige', date: '2026-09-28', cancelled: true },
      { trainingId: 't-dirige', date: '2026-10-01', cancelled: false },
      { trainingId: 't-dirige', date: '2026-10-08', cancelled: false },
      { trainingId: 't-dirige', date: '2026-12-15', cancelled: false },
    ])
    expect(upcomingSessionsFor(d, members, 'c1', 'a', '2026-09-26', 'guided').map((o) => [o.date, o.cancelled]))
      .toEqual([['2026-09-28', true], ['2026-10-01', false], ['2026-10-08', false], ['2026-12-15', false]])
    expect(upcomingSessionsFor(d, members, 'c1', 'a', '2026-09-26', 'regular').slice(0, 2).map((o) => o.date))
      .toEqual(['2026-09-29', '2026-10-06'])
  })

  it('says how many more there are', () => {
    expect(moreSessionsLabel(1)).toBe('1 autre séance')
    expect(moreSessionsLabel(5)).toBe('5 autres séances')
  })

  it('counts what is left of a series with a last date, and not of an open-ended slot', () => {
    const guided = upcomingSessionsFor(data([
      { trainingId: 't-dirige', date: '2026-10-01', cancelled: false },
      { trainingId: 't-dirige', date: '2026-10-08', cancelled: false },
      { trainingId: 't-dirige', date: '2026-10-15', cancelled: false },
      { trainingId: 't-dirige', date: '2026-12-15', cancelled: false },
      { trainingId: 't-dirige', date: '2027-01-05', cancelled: false },
    ]), members, 'c1', 'a', '2026-09-26', 'guided')
    expect(accueilColumn(guided, '2026-09-26')).toMatchObject({ hasMore: true, more: 2, total: 5 })
    const tuesdays = upcomingSessionsFor(data([]), members, 'c1', 'a', '2026-09-26', 'regular')
    expect(accueilColumn(tuesdays, '2026-09-26')).toMatchObject({ hasMore: true, more: null, total: null })
    // A slot with its own end is a series like any other.
    const bounded = upcomingSessionsFor(
      { ...data([]), trainings: [{ ...mardi, validUntil: '2026-10-27' }] }, members, 'c1', 'a', '2026-09-26', 'regular',
    )
    expect(accueilColumn(bounded, '2026-09-26')).toMatchObject({ hasMore: true, more: 2, total: 5 })
    expect(accueilColumn(guided.slice(0, 3), '2026-09-26')).toMatchObject({ hasMore: false, more: null })
  })

  it('only what the member is expected at', () => {
    const d = data([{ trainingId: 't-dirige', date: '2026-10-01', cancelled: false }])
    expect(upcomingSessionsFor(d, members, 'c1', 'b', '2026-09-26', 'guided')).toEqual([])
    expect(upcomingSessionsFor(d, members, 'c1', undefined, '2026-09-26', 'regular')).toEqual([])
  })

})

describe('mayManageSchedule', () => {
  it('admits the club\'s admins, and a guided series\' own managers', () => {
    expect(mayManageSchedule({ id: 'x', role: 'club_admin', clubId: 'c1' }, dirige)).toBe(true)
    expect(mayManageSchedule({ id: 'coach', role: 'player', clubId: 'c1' }, dirige)).toBe(true)
    expect(mayManageSchedule({ id: 'a', role: 'player', clubId: 'c1' }, dirige)).toBe(false)
    expect(mayManageSchedule(null, dirige)).toBe(false)
  })

  it('never makes anyone a manager of a regular slot', () => {
    expect(mayManageSchedule({ id: 'coach', role: 'player', clubId: 'c1' }, { ...mardi, managerIds: ['coach'] })).toBe(false)
  })
})

describe('calendar', () => {
  const address = { id: 'a1', label: 'Gymnase', street: '1 rue du Sport', postalCode: '68170', city: 'Rixheim', isDefault: true }

  it('builds the event of one session, with its end or two hours', () => {
    const e = buildTrainingEvent({ training: mardi, date: '2026-09-29' }, address)
    expect([e.startDate.getHours(), e.endDate.getHours(), e.endDate.getMinutes()]).toEqual([20, 22, 0])
    expect(e.title).toBe('Entraînement libre')
    expect(e.location).toContain('Gymnase')
    const open = buildTrainingEvent({ training: dirige, date: '2026-10-01' })
    expect([open.startDate.getHours(), open.startDate.getMinutes(), open.endDate.getHours(), open.endDate.getMinutes()])
      .toEqual([18, 30, 20, 30])
  })

  it('carries the series\' dates still on, from today', () => {
    const sessions: TrainingSession[] = [
      { trainingId: 't-dirige', date: '2026-10-08', cancelled: false },
      { trainingId: 't-dirige', date: '2026-09-20', cancelled: false },
      { trainingId: 't-dirige', date: '2026-10-01', cancelled: true },
      { trainingId: 't-dirige', date: '2026-09-30', cancelled: false },
      { trainingId: 'other', date: '2026-10-02', cancelled: false },
    ]
    expect(seriesCalendarDates(sessions, 't-dirige', '2026-09-26')).toEqual(['2026-09-30', '2026-10-08'])
  })

  it('keys each session and the series link', () => {
    expect(trainingEventUid('t-dirige', '2026-10-01')).toBe('t-dirige-2026-10-01@clubping.fr')
    expect(seriesCalendarPath({ id: 't dirigé', calendarToken: 'abc' }))
      .toBe('/trainings/t%20dirig%C3%A9/calendar.ics?token=abc')
  })
})

describe('sessionDates', () => {
  it('reads a weekly run or the dates picked, never one the series has', () => {
    expect(sessionDates({ mode: 'weekly', first: '2026-10-01', until: '2026-10-15', picked: [] }, ['2026-10-08']))
      .toEqual(['2026-10-01', '2026-10-15'])
    expect(sessionDates({ mode: 'pick', first: '', until: '', picked: ['2026-11-05', '2026-10-08'] }))
      .toEqual(['2026-10-08', '2026-11-05'])
    expect(sessionDates({ mode: 'weekly', first: '', until: '', picked: ['2026-10-08'] })).toEqual([])
    expect(sessionDatesHint(0)).toBe('Choisissez au moins une date.')
    expect(sessionDatesHint(2)).toMatch(/^2 séances\./)
  })
})
