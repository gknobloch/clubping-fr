import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { TrainingRow, TrainingSessionRow, UserRow } from './rows'
import type { DataState } from '../../src/types'

// #608 — a club's collective trainings, end to end through the real Hono app.
//
// Writing a club's calendar follows `administers` (#558), pinned to the club
// the URL names, like the member groups (#602). Answering follows the member:
// themselves, or whoever administers their club. Reading is scoped to the
// club. And the daily sweep reminds whoever is expected, inside each member's
// own lead, under #495's ledger.
//
// The rules themselves are pinned in src/lib/trainings.spec.ts; what is tested
// here is the wiring.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const MINE = 'club-mine'
const THEIRS = 'club-theirs'
const TODAY = '2026-09-26' // un samedi

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: MINE, first_login_at: null, last_seen_at: null,
  notifications_enabled: 1,
  notification_preferences: null,
  ...over,
})

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const myAdmin = member({ id: 'ca', role: 'club_admin', is_player: 0 })
const theirAdmin = member({ id: 'ca2', role: 'club_admin', club_id: THEIRS })
const alice = member({ id: 'alice' })
const bob = member({ id: 'bob' })
const stranger = member({ id: 'p9', club_id: THEIRS })

const training = (over: Partial<TrainingRow> & Pick<TrainingRow, 'id'>): TrainingRow => ({
  club_id: MINE, kind: 'guided', display_name: 'Dirigé jeunes', weekday: null,
  start_time: '18:30', end_time: null, address_id: null, member_group_ids: '[]',
  valid_from: null, valid_until: null, notes: null,
  ...over,
})

const dirige = training({ id: 't-dirige', member_group_ids: JSON.stringify(['g-jeunes']) })
const mardi = training({ id: 't-mardi', kind: 'regular', display_name: 'Libre', weekday: 2, start_time: '20:00' })
const far = training({ id: 't-far', club_id: THEIRS })

interface World {
  viewerId?: string | null
  users?: UserRow[]
  trainings?: TrainingRow[]
  sessions?: TrainingSessionRow[]
  /** (group, user) memberships; all groups are MINE's unless named `g-far`. */
  memberships?: Array<{ group_id: string; user_id: string }>
  tokens?: Array<{ token: string; user_id: string }>
  sent?: Array<{ kind: string; user_id: string; game_id: string }>
  answers?: Array<{ training_id: string; date: string; player_id: string; status: string }>
}

const GROUPS = [
  { id: 'g-jeunes', club_id: MINE, display_name: 'Jeunes' },
  { id: 'g-far', club_id: THEIRS, display_name: 'Arbitres' },
]

/** Enough D1 for the routes, the payload and the sweep, recording writes. */
function fakeDb(w: World) {
  const users = w.users ?? [generalAdmin, myAdmin, theirAdmin, alice, bob, stranger]
  const trainings = w.trainings ?? [dirige, mardi, far]
  const sessions = w.sessions ?? []
  const writes: { sql: string; params: unknown[] }[] = []

  const answer = (sql: string, params: unknown[]) => ({
    async first() {
      if (sql.includes('FROM sessions')) {
        const key = await sessionKey(TOKEN)
        return w.viewerId && params.includes(key)
          ? { token: key, user_id: w.viewerId, expires_at: Date.now() + HOUR }
          : null
      }
      if (sql.includes('FROM users WHERE id = ?')) return users.find((u) => u.id === params[0]) ?? null
      if (sql.includes('FROM trainings WHERE id = ? AND club_id = ?')) {
        return trainings.find((t) => t.id === params[0] && t.club_id === params[1]) ?? null
      }
      if (sql.includes('FROM trainings WHERE id = ?')) return trainings.find((t) => t.id === params[0]) ?? null
      if (sql.includes('FROM training_sessions WHERE training_id = ? AND date = ?')) {
        return sessions.find((s) => s.training_id === params[0] && s.date === params[1]) ?? null
      }
      if (sql.includes('FROM club_addresses WHERE id = ? AND club_id = ?')) {
        return params[0] === 'addr-mine' && params[1] === MINE ? { id: 'addr-mine' } : null
      }
      return null
    },
    async all() {
      if (sql === 'SELECT * FROM users') return { results: users }
      if (sql === 'SELECT * FROM trainings') return { results: trainings }
      if (sql === 'SELECT * FROM training_sessions') return { results: sessions }
      if (sql.includes('FROM training_sessions WHERE date BETWEEN')) {
        return { results: sessions.filter((s) => s.date >= String(params[0]) && s.date <= String(params[1])) }
      }
      if (sql === 'SELECT * FROM member_groups') return { results: GROUPS }
      if (sql.includes('FROM member_groups WHERE club_id = ?')) {
        return { results: GROUPS.filter((g) => g.club_id === params[0]) }
      }
      if (sql.includes('FROM member_groups g')) {
        return {
          results: GROUPS.filter((g) => params.includes(g.club_id)).flatMap((g): Array<typeof g & { user_id: string | null }> => {
            const ms = (w.memberships ?? []).filter((m) => m.group_id === g.id)
            return ms.length
              ? ms.map((m) => ({ ...g, user_id: m.user_id }))
              : [{ ...g, user_id: null }]
          }),
        }
      }
      if (sql.includes('FROM users WHERE club_id IN')) {
        return { results: users.filter((u) => params.includes(u.club_id)) }
      }
      if (sql.includes('FROM club_addresses WHERE club_id IN')) {
        return { results: [{ id: 'addr-mine', club_id: MINE, label: 'Gymnase Jean-Moulin', city: 'Rixheim', is_default: 1 }] }
      }
      if (sql.includes('FROM notifications_sent')) {
        const [kind, ...keys] = params
        return { results: (w.sent ?? []).filter((s) => s.kind === kind && keys.includes(s.game_id)) }
      }
      if (sql.includes('FROM training_availabilities')) return { results: w.answers ?? [] }
      if (sql.includes('FROM push_tokens')) {
        const scoped = (w.tokens ?? []).filter((t) => !params.length || params.includes(t.user_id))
        return {
          results: scoped.map((t) => ({
            ...t,
            notification_preferences: users.find((u) => u.id === t.user_id)?.notification_preferences ?? null,
          })),
        }
      }
      return { results: [] }
    },
    async run() {
      writes.push({ sql, params })
      const changes = sql.startsWith('UPDATE training_sessions')
        ? sessions.filter((s) => s.training_id === params[2] && s.date === params[3]).length
        : 1
      return { success: true, meta: { changes } }
    },
  })

  const db = {
    prepare(sql: string) {
      return {
        bind: (...params: unknown[]) => ({ ...answer(sql, params), __write: { sql, params } }),
        ...answer(sql, []),
      }
    },
    async batch(stmts: unknown[]) {
      for (const stmt of stmts) {
        const recorded = (stmt as { __write?: { sql: string; params: unknown[] } }).__write
        if (recorded) writes.push(recorded)
      }
      return stmts.map(() => ({ success: true }))
    },
  } as unknown as D1Database
  return { db, writes }
}

const send = (db: D1Database, method: string, path: string, body?: unknown, env: Record<string, unknown> = {}) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { DB: db, ...env },
  )

const writesTo = (writes: Array<{ sql: string; params: unknown[] }>, table: RegExp) =>
  writes.filter((w) => table.test(w.sql))

afterEach(() => vi.unstubAllGlobals())

// ---------------------------------------------------------------------------

describe('writing a club\'s trainings', () => {
  const body = {
    kind: 'regular', displayName: 'Libre du mardi', weekday: 2, startTime: '20:00', endTime: '22:00',
    memberGroupIds: ['g-jeunes', 'g-far', 'nope'], addressId: 'addr-mine',
  }

  it('admits a club admin at home and a general admin, nobody else', async () => {
    for (const [viewerId, status] of [['ca', 200], ['ga', 200], ['ca2', 403], ['alice', 403]] as const) {
      const { db, writes } = fakeDb({ viewerId })
      const res = await send(db, 'POST', `/clubs/${MINE}/trainings`, body)
      expect(res.status, viewerId).toBe(status)
      expect(writesTo(writes, /INSERT INTO trainings/).length, viewerId).toBe(status === 200 ? 1 : 0)
    }
  })

  it('keeps the groups and the address to the club\'s own', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    const res = await send(db, 'POST', `/clubs/${MINE}/trainings`, body)
    const { training } = await res.json() as { training: { memberGroupIds: string[]; addressId?: string } }
    expect(training.memberGroupIds).toEqual(['g-jeunes'])
    expect(training.addressId).toBe('addr-mine')
    expect(writesTo(writes, /INSERT INTO trainings/)[0].params).toContain(JSON.stringify(['g-jeunes']))
  })

  it('refuses a regular slot with no weekday, and an end before the start', async () => {
    const { db } = fakeDb({ viewerId: 'ca' })
    expect((await send(db, 'POST', `/clubs/${MINE}/trainings`, { ...body, weekday: 9 })).status).toBe(400)
    expect((await send(db, 'POST', `/clubs/${MINE}/trainings`, { ...body, endTime: '19:00' })).status).toBe(400)
    expect((await send(db, 'POST', `/clubs/${MINE}/trainings`, { ...body, kind: 'maybe' })).status).toBe(400)
  })

  it('does not find another club\'s training through my club\'s URL', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    expect((await send(db, 'PATCH', `/clubs/${MINE}/trainings/t-far`, { displayName: 'x' })).status).toBe(404)
    expect(writesTo(writes, /UPDATE trainings/)).toEqual([])
  })

  it('never changes a training\'s kind on edit', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    const res = await send(db, 'PATCH', `/clubs/${MINE}/trainings/t-dirige`, { kind: 'regular', displayName: 'Dirigé' })
    expect(res.status).toBe(200)
    const { training } = await res.json() as { training: { kind: string } }
    expect(training.kind).toBe('guided')
    expect(writesTo(writes, /UPDATE trainings/)[0].sql).not.toContain('kind')
  })

  it('deletes a series with its dates and answers', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    await send(db, 'DELETE', `/clubs/${MINE}/trainings/t-dirige`)
    expect(writes.map((w) => w.sql.split(' WHERE')[0])).toEqual([
      'DELETE FROM training_availabilities',
      'DELETE FROM training_sessions',
      'DELETE FROM trainings',
    ])
  })
})

describe('dates and exceptions', () => {
  it('adds dates to a guided series only', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    const res = await send(db, 'POST', `/clubs/${MINE}/trainings/t-dirige/sessions`, {
      dates: ['2026-10-01', '2026-10-08', '2026-10-01'],
    })
    expect(res.status).toBe(200)
    expect(writesTo(writes, /INSERT OR IGNORE INTO training_sessions/).map((w) => w.params[1]))
      .toEqual(['2026-10-01', '2026-10-08'])
    expect((await send(db, 'POST', `/clubs/${MINE}/trainings/t-mardi/sessions`, { dates: ['2026-10-01'] })).status)
      .toBe(400)
    expect((await send(db, 'POST', `/clubs/${MINE}/trainings/t-dirige/sessions`, { dates: ['demain'] })).status)
      .toBe(400)
  })

  it('records a cancelled Tuesday as an exception, and forgets one that says nothing', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    await send(db, 'PUT', `/clubs/${MINE}/trainings/t-mardi/sessions/2026-09-29`, { cancelled: true, note: 'Gymnase fermé' })
    expect(writesTo(writes, /INSERT INTO training_sessions/)[0].params).toEqual(['t-mardi', '2026-09-29', 1, 'Gymnase fermé'])
    await send(db, 'PUT', `/clubs/${MINE}/trainings/t-mardi/sessions/2026-09-29`, { cancelled: false, note: '' })
    expect(writesTo(writes, /DELETE FROM training_sessions/)).toHaveLength(1)
  })

  it('never creates a guided date through the exception route', async () => {
    const { db, writes } = fakeDb({ viewerId: 'ca' })
    const res = await send(db, 'PUT', `/clubs/${MINE}/trainings/t-dirige/sessions/2026-10-01`, { cancelled: true })
    expect(res.status).toBe(404)
    expect(writesTo(writes, /INSERT/)).toEqual([])
  })

  it('refuses a player', async () => {
    const { db, writes } = fakeDb({ viewerId: 'alice' })
    expect((await send(db, 'PUT', `/clubs/${MINE}/trainings/t-mardi/sessions/2026-09-29`, { cancelled: true })).status).toBe(403)
    expect(writes).toEqual([])
  })
})

describe('answering for a guided session', () => {
  const sessions: TrainingSessionRow[] = [{ training_id: 't-dirige', date: '2026-10-01', cancelled: 0, note: null }]
  const set = (db: D1Database, playerId: string, trainingId = 't-dirige') =>
    send(db, 'POST', '/training-availabilities/set', { trainingId, date: '2026-10-01', playerId, status: 'available' })

  it('lets a member answer for themselves, and their club\'s admin for them', async () => {
    expect((await set(fakeDb({ viewerId: 'alice', sessions }).db, 'alice')).status).toBe(200)
    expect((await set(fakeDb({ viewerId: 'ca', sessions }).db, 'alice')).status).toBe(200)
  })

  it('refuses a team-mate, another club\'s admin, and another club\'s member', async () => {
    expect((await set(fakeDb({ viewerId: 'bob', sessions }).db, 'alice')).status).toBe(403)
    expect((await set(fakeDb({ viewerId: 'ca2', sessions }).db, 'alice')).status).toBe(403)
    expect((await set(fakeDb({ viewerId: 'p9', sessions }).db, 'p9')).status).toBe(403)
  })

  it('asks nothing of a regular slot, and needs the session to exist', async () => {
    expect((await set(fakeDb({ viewerId: 'alice', sessions }).db, 'alice', 't-mardi')).status).toBe(400)
    expect((await set(fakeDb({ viewerId: 'alice', sessions: [] }).db, 'alice')).status).toBe(404)
  })
})

describe('GET /api/data', () => {
  const sessions: TrainingSessionRow[] = [
    { training_id: 't-dirige', date: '2026-10-01', cancelled: 0, note: null },
    { training_id: 't-far', date: '2026-10-01', cancelled: 1, note: 'x' },
  ]

  it('sends a club\'s trainings to that club only', async () => {
    const res = await send(fakeDb({ viewerId: 'alice', sessions }).db, 'GET', '/data')
    const data = await res.json() as DataState
    expect(data.trainings.map((t) => t.id).sort()).toEqual(['t-dirige', 't-mardi'])
    expect(data.trainingSessions).toEqual([{ trainingId: 't-dirige', date: '2026-10-01', cancelled: false }])
    expect(data.trainings.find((t) => t.id === 't-dirige')?.memberGroupIds).toEqual(['g-jeunes'])
  })

  it('sends every club\'s to a general admin', async () => {
    const data = await (await send(fakeDb({ viewerId: 'ga', sessions }).db, 'GET', '/data')).json() as DataState
    expect(data.trainings).toHaveLength(3)
    expect(data.trainingSessions).toHaveLength(2)
  })
})

describe('preferences', () => {
  it('merges a category change into what the member chose before', async () => {
    const me = member({ id: 'alice', notification_preferences: JSON.stringify({ training_guided: { leadDays: 5 } }) })
    const { db, writes } = fakeDb({ viewerId: 'alice', users: [me] })
    const res = await send(db, 'PATCH', '/notifications/preferences', {
      categories: { training_guided: { enabled: false }, bogus: { enabled: true } },
    })
    expect(res.status).toBe(200)
    const stored = writesTo(writes, /SET notification_preferences/)[0].params[0]
    expect(JSON.parse(String(stored))).toEqual({ training_guided: { enabled: false, leadDays: 5 } })
    expect(writesTo(writes, /notifications_enabled/)).toEqual([])
  })

  it('still takes the master switch alone, as every build since #495 sends it', async () => {
    const { db, writes } = fakeDb({ viewerId: 'alice' })
    expect((await send(db, 'PATCH', '/notifications/preferences', { enabled: false })).status).toBe(200)
    expect(writesTo(writes, /notifications_enabled/)[0].params).toEqual([0, 'alice'])
    expect((await send(db, 'PATCH', '/notifications/preferences', {})).status).toBe(400)
  })

  it('rides with the session\'s own user', async () => {
    const me = member({ id: 'alice', email: 'a@b.fr', notification_preferences: JSON.stringify({ training_regular: { enabled: true } }) })
    const res = await send(fakeDb({ viewerId: 'alice', users: [me] }).db, 'GET', '/auth/me')
    const body = await res.json() as { user: { notificationPreferences: unknown } }
    expect(body.user.notificationPreferences).toEqual({ training_regular: { enabled: true } })
  })
})

describe('the daily sweep', () => {
  const env = { NOTIFY_SECRET: 's3cret' }
  const dispatch = (db: D1Database) =>
    app.fetch(
      new Request('http://localhost/api/notifications/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer s3cret' },
        body: JSON.stringify({ today: TODAY }),
      }),
      { DB: db, ...env },
    )

  function stubExpo() {
    const sent: Array<{ to: string; title: string; body: string; data: Record<string, string> }> = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const messages = JSON.parse(String(init.body))
      sent.push(...messages)
      return new Response(JSON.stringify({ data: messages.map(() => ({ status: 'ok', id: 't' })) }), { status: 200 })
    })
    return sent
  }

  const tokens = [
    { token: 'ExponentPushToken[alice]', user_id: 'alice' },
    { token: 'ExponentPushToken[bob]', user_id: 'bob' },
  ]

  it('reminds a guided session\'s group three days ahead, and records it', async () => {
    const sent = stubExpo()
    const { db, writes } = fakeDb({
      trainings: [dirige],
      sessions: [{ training_id: 't-dirige', date: '2026-09-29', cancelled: 0, note: null }],
      memberships: [{ group_id: 'g-jeunes', user_id: 'alice' }],
      tokens,
    })
    const res = await dispatch(db)
    const report = await res.json() as { trainings: { reminders: number } }
    expect(report.trainings.reminders).toBe(1)
    expect(sent.map((m) => m.to)).toEqual(['ExponentPushToken[alice]'])
    expect(sent[0].body).toBe('mardi 29 septembre à 18h30 à Gymnase Jean-Moulin, dans 3 jours. Indique si tu viens.')
    expect(sent[0].data).toEqual({ kind: 'training_reminder', trainingId: 't-dirige', date: '2026-09-29' })
    const ledger = writesTo(writes, /INSERT INTO notifications_sent/)
    expect(ledger.map((w) => w.params.slice(0, 3))).toEqual([['training_reminder', 'alice', 't-dirige@2026-09-29']])
  })

  it('leaves a regular slot alone unless the member asked for it', async () => {
    const sent = stubExpo()
    const wants = member({ id: 'bob', notification_preferences: JSON.stringify({ training_regular: { enabled: true } }) })
    const { db } = fakeDb({ trainings: [mardi], users: [alice, wants], tokens })
    await dispatch(db)
    expect(sent.map((m) => m.to)).toEqual(['ExponentPushToken[bob]'])
    expect(sent[0].body).toBe('mardi 29 septembre à 20h à Gymnase Jean-Moulin, dans 3 jours.')
  })

  it('does not remind twice', async () => {
    const sent = stubExpo()
    const { db } = fakeDb({
      trainings: [dirige],
      sessions: [{ training_id: 't-dirige', date: '2026-09-29', cancelled: 0, note: null }],
      memberships: [{ group_id: 'g-jeunes', user_id: 'alice' }],
      tokens,
      sent: [{ kind: 'training_reminder', user_id: 'alice', game_id: 't-dirige@2026-09-29' }],
    })
    await dispatch(db)
    expect(sent).toEqual([])
  })

  it('tells whoever was reminded, or said yes, that a session is off — once', async () => {
    const sent = stubExpo()
    const { db, writes } = fakeDb({
      trainings: [dirige],
      sessions: [{ training_id: 't-dirige', date: '2026-09-28', cancelled: 1, note: 'Salle prise.' }],
      memberships: [{ group_id: 'g-jeunes', user_id: 'alice' }, { group_id: 'g-jeunes', user_id: 'bob' }],
      tokens,
      sent: [{ kind: 'training_reminder', user_id: 'alice', game_id: 't-dirige@2026-09-28' }],
      answers: [{ training_id: 't-dirige', date: '2026-09-28', player_id: 'bob', status: 'available' }],
    })
    const report = await (await dispatch(db)).json() as { trainings: { cancellations: number; reminders: number } }
    expect(report.trainings).toMatchObject({ reminders: 0, cancellations: 2 })
    expect(sent.map((m) => m.title)).toEqual(['Annulé — Dirigé jeunes', 'Annulé — Dirigé jeunes'])
    expect(sent[0].body).toBe('Dirigé jeunes, lundi 28 septembre à 18h30 : séance annulée. Salle prise.')
    expect(writesTo(writes, /INSERT INTO notifications_sent/).map((w) => w.params[0]))
      .toEqual(['training_cancelled', 'training_cancelled'])
  })
})
