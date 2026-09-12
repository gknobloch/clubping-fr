import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'

// The push endpoints and the daily sweep (#495), end to end through the real
// Hono app: what the routes refuse, what the sweep decides to send, and what it
// writes down so it never says the same thing twice. The rules themselves are
// pinned in src/lib/pushNotifications.spec.ts, with no database in the way —
// what is tested here is the wiring D1 and Expo sit on either side of.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const CLUB = 'club-fftt-06680011'
const TODAY = '2026-09-11'
const EXPO = 'https://exp.host/--/api/v2/push/send'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'Alice', last_name: 'Martin', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: CLUB, first_login_at: null, last_seen_at: null,
  notifications_enabled: 1,
  ...over,
})

/** A fixture row of the squad/fixture query, both routes share its shape. */
interface FixtureRow {
  game_id: string
  date: string
  team_id: string
  player_ids: string
  home_team_id: string
  team_label: string
  opponent_label: string | null
  captain_id: string
}

const fixture = (over: Partial<FixtureRow> & Pick<FixtureRow, 'team_id'>): FixtureRow => ({
  game_id: 'g1',
  date: '2026-09-18',
  player_ids: JSON.stringify(['alice', 'bob']),
  home_team_id: 't-home',
  team_label: 'PPA Rixheim 3',
  opponent_label: 'Mulhouse ASPTT 2',
  captain_id: 'cap',
  ...over,
})

interface DbFixture {
  users?: UserRow[]
  viewerId?: string | null
  fixtures?: FixtureRow[]
  /** Rows of push_tokens, as (token, user_id). */
  tokens?: Array<{ token: string; user_id: string }>
  /** (user_id, game_id) pairs already in notifications_sent. */
  sent?: Array<{ user_id: string; game_id: string }>
  /** The availability a player had before the write, if any. */
  previousStatus?: string | null
}

/** Enough D1 for the guard, the sweep and the captain hook, recording writes. */
function fakeDb(f: DbFixture) {
  const users = f.users ?? []
  const writes: { sql: string; params: unknown[] }[] = []
  const notifiable = new Set(users.filter((u) => u.notifications_enabled !== 0).map((u) => u.id))

  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async first() {
          if (sql.includes('FROM sessions')) {
            return f.viewerId && params.includes(TOKEN)
              ? { token: TOKEN, user_id: f.viewerId, expires_at: Date.now() + HOUR }
              : null
          }
          if (sql.includes('FROM users WHERE id = ?')) {
            return users.find((u) => u.id === params[0]) ?? null
          }
          if (sql.includes('first_name, last_name FROM users')) {
            const u = users.find((x) => x.id === params[0])
            return u ? { first_name: u.first_name, last_name: u.last_name } : null
          }
          if (sql.includes('FROM game_availabilities')) {
            return f.previousStatus ? { status: f.previousStatus } : null
          }
          return null
        },
        async all() {
          // Both the sweep and the captain hook read fixtures through the same
          // join; only the second asks for the captain.
          if (sql.includes('FROM games g')) {
            const rows = f.fixtures ?? []
            return {
              results: sql.includes('captain_id')
                ? rows.filter((r) => r.game_id === params[0])
                : rows.filter((r) => r.date >= String(params[0]) && r.date <= String(params[1])),
            }
          }
          if (sql.includes('FROM push_tokens')) {
            const scoped = params.length
              ? (f.tokens ?? []).filter((t) => params.includes(t.user_id))
              : (f.tokens ?? [])
            return { results: scoped.filter((t) => notifiable.has(t.user_id)) }
          }
          if (sql.includes('FROM notifications_sent')) {
            const games = params.slice(1)
            return { results: (f.sent ?? []).filter((s) => games.includes(s.game_id)) }
          }
          return { results: [] }
        },
        async run() {
          writes.push({ sql, params })
          return { success: true }
        },
      })
      // A statement with nothing to bind is still a statement: the sweep reads
      // every device in one unbound query, so the unbound forms answer the
      // same way rather than returning an empty result the routing never sees.
      return { bind: (...params: unknown[]) => ({ ...bound(params), __write: { sql, params } }), ...bound([]) }
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

const send = (
  db: D1Database,
  path: string,
  method: string,
  body?: unknown,
  env: Record<string, unknown> = {},
  auth = `Bearer ${TOKEN}`,
) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { DB: db, ...env },
  )

/** Capture what would have gone to Expo, and answer as Expo does. */
function stubExpo(tickets?: (to: string) => unknown) {
  const batches: Array<Array<{ to: string; title: string; body: string }>> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toBe(EXPO)
    const messages = JSON.parse(String(init.body))
    batches.push(messages)
    return new Response(
      JSON.stringify({
        data: messages.map((m: { to: string }) =>
          tickets ? tickets(m.to) : { status: 'ok', id: 'ticket' }),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })
  return { batches, sent: () => batches.flat() }
}

afterEach(() => vi.unstubAllGlobals())

const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error
const writesTo = (writes: Array<{ sql: string; params: unknown[] }>, table: RegExp) =>
  writes.filter((w) => table.test(w.sql))

// ---------------------------------------------------------------------------

describe('registering a device', () => {
  const alice = member({ id: 'alice' })

  it('refuses anything that is not an Expo push token', async () => {
    const { db, writes } = fakeDb({ users: [alice], viewerId: 'alice' })
    const res = await send(db, '/notifications/push-tokens', 'POST', {
      token: 'https://example.invalid/hook', platform: 'ios',
    })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('invalid_token')
    expect(writesTo(writes, /push_tokens/)).toEqual([])
  })

  it('needs a session — a token is claimed by somebody', async () => {
    const { db } = fakeDb({ users: [alice], viewerId: null })
    const res = await send(db, '/notifications/push-tokens', 'POST', {
      token: 'ExponentPushToken[aaa]', platform: 'ios',
    })
    expect(res.status).toBe(401)
  })

  it('upserts on the token alone, so a shared phone changes hands', async () => {
    // A club phone signed into by the next captain re-registers the SAME Expo
    // token: the row has to move, or the previous holder keeps being notified.
    const { db, writes } = fakeDb({ users: [alice], viewerId: 'alice' })
    const res = await send(db, '/notifications/push-tokens', 'POST', {
      token: 'ExponentPushToken[aaa]', platform: 'android',
    })
    expect(res.status).toBe(200)

    const write = writesTo(writes, /push_tokens/)[0]
    expect(write.sql).toContain('ON CONFLICT(token) DO UPDATE')
    expect(write.sql).toContain('user_id = excluded.user_id')
    expect(write.params.slice(0, 3)).toEqual(['ExponentPushToken[aaa]', 'alice', 'android'])
  })

  it('forgets a token by the token, not by who is signed in', async () => {
    const { db, writes } = fakeDb({ users: [alice], viewerId: 'alice' })
    const res = await send(db, '/notifications/push-tokens/forget', 'POST', {
      token: 'ExponentPushToken[aaa]',
    })
    expect(res.status).toBe(200)

    const write = writesTo(writes, /DELETE FROM push_tokens/)[0]
    expect(write.params).toEqual(['ExponentPushToken[aaa]'])
  })
})

describe('the member’s own switch', () => {
  it('writes the session’s row and takes no id', async () => {
    const { db, writes } = fakeDb({
      users: [member({ id: 'alice' }), member({ id: 'bob' })],
      viewerId: 'alice',
    })
    const res = await send(db, '/notifications/preferences', 'PATCH', { enabled: false })
    expect(res.status).toBe(200)

    const write = writesTo(writes, /notifications_enabled/)[0]
    expect(write.params).toEqual([0, 'alice'])
  })

  it('refuses anything that is not a boolean', async () => {
    const { db } = fakeDb({ users: [member({ id: 'alice' })], viewerId: 'alice' })
    const res = await send(db, '/notifications/preferences', 'PATCH', { enabled: 'non' })
    expect(res.status).toBe(400)
  })
})

describe('the daily sweep', () => {
  const alice = member({ id: 'alice' })
  const bob = member({ id: 'bob', first_name: 'Bob', last_name: 'Durand' })
  const squad = [fixture({ team_id: 't-home' })]
  const tokens = [
    { token: 'ExponentPushToken[alice]', user_id: 'alice' },
    { token: 'ExponentPushToken[bob]', user_id: 'bob' },
  ]
  const dispatch = (db: D1Database, env: Record<string, unknown>, auth?: string) =>
    send(db, '/notifications/dispatch', 'POST', { today: TODAY }, env, auth ?? 'Bearer s3cret')

  it('does not exist in an environment with no secret', async () => {
    // A 404, not a 401: a preview should not even admit to having this.
    const { db } = fakeDb({})
    const res = await dispatch(db, {})
    expect(res.status).toBe(404)
  })

  it('refuses a wrong secret', async () => {
    const { db } = fakeDb({})
    const res = await dispatch(db, { NOTIFY_SECRET: 's3cret' }, 'Bearer wrong')
    expect(res.status).toBe(401)
  })

  it('asks every member of the squad, once each', async () => {
    const expo = stubExpo()
    const { db, writes } = fakeDb({ users: [alice, bob], fixtures: squad, tokens })
    const res = await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ due: 2, sent: 2 })

    expect(expo.sent().map((m) => m.to).sort()).toEqual([
      'ExponentPushToken[alice]', 'ExponentPushToken[bob]',
    ])
    expect(expo.sent()[0].title).toBe('PPA Rixheim 3 — ta dispo ?')
    expect(expo.sent()[0].body).toContain('vendredi 18 septembre, dans 7 jours')

    // And writes down that it did, which is what stops tomorrow's run.
    const ledger = writesTo(writes, /notifications_sent/)
    expect(ledger).toHaveLength(2)
    expect(ledger[0].params.slice(0, 3)).toEqual(['availability_request', 'alice', 'g1'])
  })

  it('says nothing twice', async () => {
    const expo = stubExpo()
    const { db } = fakeDb({
      users: [alice, bob], fixtures: squad, tokens,
      sent: [{ user_id: 'alice', game_id: 'g1' }, { user_id: 'bob', game_id: 'g1' }],
    })
    const res = await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(await res.json()).toMatchObject({ due: 0, sent: 0 })
    expect(expo.sent()).toEqual([])
  })

  it('skips a member who turned notifications off, and records nothing for them', async () => {
    // Recording would mean that turning them back on tomorrow still leaves
    // them unasked about Saturday.
    const expo = stubExpo()
    const { db, writes } = fakeDb({
      users: [alice, member({ id: 'bob', notifications_enabled: 0 })],
      fixtures: squad, tokens,
    })
    await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(expo.sent().map((m) => m.to)).toEqual(['ExponentPushToken[alice]'])
    expect(writesTo(writes, /notifications_sent/)).toHaveLength(1)
  })

  it('records nothing for a member who has never installed the app', async () => {
    const expo = stubExpo()
    const { db, writes } = fakeDb({
      users: [alice, bob], fixtures: squad,
      tokens: [{ token: 'ExponentPushToken[alice]', user_id: 'alice' }],
    })
    await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(expo.sent()).toHaveLength(1)
    expect(writesTo(writes, /notifications_sent/)).toHaveLength(1)
  })

  it('rings both devices of a member who has two', async () => {
    const expo = stubExpo()
    const { db, writes } = fakeDb({
      users: [alice], fixtures: [fixture({ team_id: 't-home', player_ids: '["alice"]' })],
      tokens: [
        { token: 'ExponentPushToken[phone]', user_id: 'alice' },
        { token: 'ExponentPushToken[tablet]', user_id: 'alice' },
      ],
    })
    await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(expo.sent()).toHaveLength(2)
    // One member, one match, one ledger row — however many devices.
    expect(writesTo(writes, /notifications_sent/)).toHaveLength(1)
  })

  it('deletes a token Expo says belongs to a vanished install', async () => {
    const expo = stubExpo((to) =>
      to === 'ExponentPushToken[bob]'
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'ticket' })
    const { db, writes } = fakeDb({ users: [alice, bob], fixtures: squad, tokens })
    const res = await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(await res.json()).toMatchObject({ prunedTokens: 1 })
    expect(expo.sent()).toHaveLength(2)

    const pruned = writesTo(writes, /DELETE FROM push_tokens/)[0]
    expect(pruned.params).toEqual(['ExponentPushToken[bob]'])
  })

  it('sends nothing when no fixture falls in the window', async () => {
    const expo = stubExpo()
    const { db } = fakeDb({ users: [alice], fixtures: [], tokens })
    const res = await dispatch(db, { NOTIFY_SECRET: 's3cret' })
    expect(await res.json()).toMatchObject({ games: 0, sent: 0 })
    expect(expo.sent()).toEqual([])
  })
})

describe('a change of mind reaches the captain', () => {
  const alice = member({ id: 'alice' })
  const cap = member({ id: 'cap', first_name: 'Camille', last_name: 'Roy' })
  const both = [
    fixture({ team_id: 't-home', captain_id: 'cap' }),
    fixture({ team_id: 't-away', captain_id: 'cap-away', player_ids: '["zoe"]' }),
  ]
  const tokens = [{ token: 'ExponentPushToken[cap]', user_id: 'cap' }]

  const setAvailability = (db: D1Database, status: string) =>
    send(db, '/game-availabilities/set', 'POST',
      { gameId: 'g1', playerId: 'alice', status }, {})

  it('names the player and both ends of the change', async () => {
    const expo = stubExpo()
    const { db } = fakeDb({
      users: [alice, cap], viewerId: 'alice',
      fixtures: both, tokens, previousStatus: 'available',
    })
    vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
    const res = await setAvailability(db, 'unavailable')
    vi.useRealTimers()
    expect(res.status).toBe(200)

    expect(expo.sent()).toHaveLength(1)
    expect(expo.sent()[0].to).toBe('ExponentPushToken[cap]')
    expect(expo.sent()[0].title).toBe('Alice Martin — indisponible')
    expect(expo.sent()[0].body).toContain('disponible → indisponible')
  })

  it('stays quiet on a first answer', async () => {
    // The expected reply to the daily reminder. A captain pushed once per
    // team-mate the evening it goes out stops reading the one that matters.
    const expo = stubExpo()
    const { db } = fakeDb({
      users: [alice, cap], viewerId: 'alice',
      fixtures: both, tokens, previousStatus: null,
    })
    await setAvailability(db, 'unavailable')
    expect(expo.sent()).toEqual([])
  })

  it('stays quiet when the answer did not actually change', async () => {
    const expo = stubExpo()
    const { db } = fakeDb({
      users: [alice, cap], viewerId: 'alice',
      fixtures: both, tokens, previousStatus: 'available',
    })
    await setAvailability(db, 'available')
    expect(expo.sent()).toEqual([])
  })

  it('never pushes the captain their own override', async () => {
    const expo = stubExpo()
    const { db } = fakeDb({
      users: [alice, cap], viewerId: 'cap',
      fixtures: both, tokens, previousStatus: 'available',
    })
    vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
    await setAvailability(db, 'unavailable')
    vi.useRealTimers()
    expect(expo.sent()).toEqual([])
  })

  it('stays quiet about a match beyond the window', async () => {
    const expo = stubExpo()
    const { db } = fakeDb({
      users: [alice, cap], viewerId: 'alice',
      fixtures: both.map((r) => ({ ...r, date: '2026-10-03' })),
      tokens, previousStatus: 'available',
    })
    vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
    await setAvailability(db, 'unavailable')
    vi.useRealTimers()
    expect(expo.sent()).toEqual([])
  })

  it('records the availability even when the push cannot go out', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('exp.host unreachable') })
    const { db, writes } = fakeDb({
      users: [alice, cap], viewerId: 'alice',
      fixtures: both, tokens, previousStatus: 'available',
    })
    vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
    const res = await setAvailability(db, 'unavailable')
    vi.useRealTimers()
    expect(res.status).toBe(200)
    expect(writesTo(writes, /INSERT INTO game_availabilities/)).toHaveLength(1)
  })
})
