import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import type { UserRow } from './rows'
import type { Player, User } from '../../src/types'

// #406 — a club that has just shared the app wants to know who has opened it.
// The answer is `users.last_seen_at`, and the only thing standing between it
// and every member of every club is this filter: GET /api/data builds one
// payload and hands it to whoever asked. A test that only checked the admin
// case would pass on a route that leaked the field to everyone, so the shape of
// these tests is deliberately the negative one.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'

const VISIT = '2026-08-10T09:00:00.000Z'
const VISIT_MS = Date.parse(VISIT)

/** A `users` row, with only the columns these tests care about spelled out. */
function member(over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow {
  return {
    email: `${over.id}@example.invalid`,
    role: 'player',
    is_player: 1,
    first_name: 'A',
    last_name: 'B',
    license_number: '1',
    phone: '',
    birth_date: null,
    birth_place: null,
    status: 'active',
    club_id: null,
    first_login_at: null,
    last_seen_at: null,
    ...over,
  }
}

const RIXHEIM = 'club-1'
const OTHER_CLUB = 'club-2'

const teammate = member({ id: 'teammate', club_id: RIXHEIM, last_seen_at: VISIT_MS })
const strangerElsewhere = member({ id: 'stranger', club_id: OTHER_CLUB, last_seen_at: VISIT_MS })

/**
 * Enough D1 for the guard (a session, then the member) and for GET /api/data
 * (every table empty but `users`). Rows are handed out as copies so that the
 * guard's own last_seen_at refresh cannot rewrite the fixture underneath the
 * assertions — that write is asserted on `statements` instead.
 */
function dbWith(users: UserRow[], viewerId: string | null) {
  const statements: { sql: string; params: unknown[] }[] = []
  const copyOf = (id: unknown) => {
    const found = users.find((u) => u.id === id)
    return found ? { ...found } : null
  }
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async first() {
          if (sql.includes('FROM sessions')) {
            // Since #410 the lookup binds the digest and the plaintext; this
            // fixture answers to the plaintext, the pre-#410 storage form.
            return viewerId && params.includes(TOKEN)
              ? { token: TOKEN, user_id: viewerId, expires_at: Date.now() + HOUR }
              : null
          }
          if (sql.includes('FROM users WHERE id = ?')) return copyOf(params[0])
          return null
        },
        async all() {
          return { results: [] }
        },
        async run() {
          return { success: true }
        },
      })
      return {
        bind: (...params: unknown[]) => {
          statements.push({ sql, params })
          return bound(params)
        },
        async first() {
          return null
        },
        async all() {
          return { results: sql === 'SELECT * FROM users' ? users.map((u) => ({ ...u })) : [] }
        },
        async run() {
          return { success: true }
        },
      }
    },
  } as unknown as D1Database
  return { db, statements }
}

async function getData(db: D1Database, env: Record<string, unknown> = {}) {
  const res = await app.fetch(
    new Request('http://localhost/api/data', { headers: { Authorization: `Bearer ${TOKEN}` } }),
    { DB: db, ...env },
  )
  expect(res.status).toBe(200)
  return (await res.json()) as { players: Player[]; users: User[] }
}

/** The `lastSeenAt` the payload carries for a member, from both projections. */
function seenBy(data: { players: Player[]; users: User[] }, id: string) {
  return {
    player: data.players.find((p) => p.id === id)?.lastSeenAt,
    user: data.users.find((u) => u.id === id)?.lastSeenAt,
  }
}

describe('GET /api/data — who is told when a member last visited (#406)', () => {
  it('gives a general admin every member, whatever their club', async () => {
    const viewer = member({ id: 'root', role: 'general_admin', is_player: 0 })
    const { db } = dbWith([viewer, teammate, strangerElsewhere], viewer.id)

    const data = await getData(db)
    expect(seenBy(data, teammate.id)).toEqual({ player: VISIT, user: VISIT })
    expect(seenBy(data, strangerElsewhere.id)).toEqual({ player: VISIT, user: VISIT })
  })

  it('gives a club admin their own club, and nothing of another', async () => {
    const viewer = member({ id: 'prez', role: 'club_admin', is_player: 0, club_id: RIXHEIM })
    const { db } = dbWith([viewer, teammate, strangerElsewhere], viewer.id)

    const data = await getData(db)
    expect(seenBy(data, teammate.id)).toEqual({ player: VISIT, user: VISIT })
    expect(seenBy(data, strangerElsewhere.id)).toEqual({ player: undefined, user: undefined })
  })

  // A club admin with no club of their own would otherwise match every row
  // whose club_id is NULL — the placeholder rows, not a club they administer.
  it('gives a club admin with no club attached nobody at all', async () => {
    const viewer = member({ id: 'orphan', role: 'club_admin', is_player: 0 })
    const clubless = member({ id: 'clubless', last_seen_at: VISIT_MS })
    const { db } = dbWith([viewer, clubless, teammate], viewer.id)

    const data = await getData(db)
    expect(seenBy(data, clubless.id)).toEqual({ player: undefined, user: undefined })
    expect(seenBy(data, teammate.id)).toEqual({ player: undefined, user: undefined })
  })

  it('gives a player nobody — not their club mates, and not themselves', async () => {
    const viewer = member({ id: 'teammate', club_id: RIXHEIM, last_seen_at: VISIT_MS })
    const { db } = dbWith([viewer, strangerElsewhere], viewer.id)

    const data = await getData(db)
    expect(seenBy(data, viewer.id)).toEqual({ player: undefined, user: undefined })
    expect(seenBy(data, strangerElsewhere.id)).toEqual({ player: undefined, user: undefined })
  })

  it('omits the field for a member who has never signed in', async () => {
    const viewer = member({ id: 'prez', role: 'club_admin', is_player: 0, club_id: RIXHEIM })
    const newcomer = member({ id: 'newcomer', club_id: RIXHEIM })
    const { db } = dbWith([viewer, newcomer], viewer.id)

    const data = await getData(db)
    expect(seenBy(data, newcomer.id)).toEqual({ player: undefined, user: undefined })
  })

  // The local-only escape hatch already serves this whole payload to an
  // unauthenticated caller (#138), so withholding one field would hide the
  // feature from local development and protect nothing.
  it('serves the field with no session when AUTH_GUARD_DISABLED is set', async () => {
    const { db } = dbWith([teammate], null)

    const data = await getData(db, { AUTH_GUARD_DISABLED: 'true' })
    expect(seenBy(data, teammate.id)).toEqual({ player: VISIT, user: VISIT })
  })
})

describe('refreshing last_seen_at on the way through the guard (#406)', () => {
  const updates = (statements: { sql: string; params: unknown[] }[]) =>
    statements.filter((s) => s.sql.startsWith('UPDATE users SET last_seen_at'))

  it('writes when the stored visit has gone stale', async () => {
    const viewer = member({ id: 'teammate', club_id: RIXHEIM, last_seen_at: Date.now() - 2 * HOUR })
    const { db, statements } = dbWith([viewer], viewer.id)

    await getData(db)
    const [write] = updates(statements)
    expect(write).toBeDefined()
    expect(write.params[1]).toBe(viewer.id)
    expect(write.params[0]).toBeGreaterThan(Date.now() - HOUR)
  })

  it('writes for a member who has never been seen', async () => {
    const viewer = member({ id: 'newcomer', club_id: RIXHEIM })
    const { db, statements } = dbWith([viewer], viewer.id)

    await getData(db)
    expect(updates(statements)).toHaveLength(1)
  })

  // Every authenticated request passes through the guard. Writing on each one
  // would put a D1 write in front of every page load, for a value read as a date.
  it('stays silent while the stored visit is still fresh', async () => {
    const viewer = member({ id: 'teammate', club_id: RIXHEIM, last_seen_at: Date.now() - 60_000 })
    const { db, statements } = dbWith([viewer], viewer.id)

    await getData(db)
    expect(updates(statements)).toHaveLength(0)
  })
})
