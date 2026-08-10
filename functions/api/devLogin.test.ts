import { describe, expect, it } from 'vitest'
import { authApp } from './auth'

// /auth/dev/* signs in as any user with no credential (#313). It exists for
// preview deployments, whose database is anonymised. Everywhere else it must
// not merely refuse — it must not appear to exist, so nothing advertises an
// authentication bypass that a misconfiguration could switch on.
//
// The database binding here throws if touched: the point is that a disabled
// endpoint returns before ever reaching it.
const explodingDb = {
  prepare() {
    throw new Error('the database must not be touched when dev login is disabled')
  },
} as unknown as D1Database

const request = (env: Record<string, unknown>, path: string, init?: RequestInit) =>
  authApp.fetch(new Request(`http://localhost/${path}`, init), env)

describe('dev login endpoints — gating (#313)', () => {
  for (const env of [
    { label: 'unset', DEV_LOGIN_ENABLED: undefined },
    { label: 'the string "false"', DEV_LOGIN_ENABLED: 'false' },
    // Anything but the exact string is off, so a truthy-looking value cannot
    // switch on a bypass by accident.
    { label: 'the string "1"', DEV_LOGIN_ENABLED: '1' },
    { label: 'the string "TRUE"', DEV_LOGIN_ENABLED: 'TRUE' },
  ]) {
    it(`answers 404 to GET /dev/users when DEV_LOGIN_ENABLED is ${env.label}`, async () => {
      const res = await request({ DB: explodingDb, DEV_LOGIN_ENABLED: env.DEV_LOGIN_ENABLED }, 'dev/users')
      expect(res.status).toBe(404)
    })

    it(`answers 404 to POST /dev/login when DEV_LOGIN_ENABLED is ${env.label}`, async () => {
      const res = await request(
        { DB: explodingDb, DEV_LOGIN_ENABLED: env.DEV_LOGIN_ENABLED },
        'dev/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'u1' }),
        },
      )
      expect(res.status).toBe(404)
    })
  }
})

describe('dev login endpoints — enabled (#313)', () => {
  const user = {
    id: 'u1', email: 'membre1@example.invalid', role: 'club_admin', is_player: 1,
    first_name: 'Camille', last_name: 'Martin', club_id: 'club-1',
  }

  function dbWith(found: typeof user | null) {
    const inserted: unknown[][] = []
    return {
      inserted,
      db: {
        prepare(sql: string) {
          return {
            bind: (...args: unknown[]) => ({
              first: async () => (sql.includes('FROM users') ? found : null),
              run: async () => {
                inserted.push([sql, ...args])
                return { success: true }
              },
            }),
            all: async () => ({ results: found ? [found] : [] }),
          }
        },
      } as unknown as D1Database,
    }
  }

  it('lists the database users rather than mock fixtures', async () => {
    const { db } = dbWith(user)
    const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

    expect(res.status).toBe(200)
    const { users } = await res.json<{ users: { id: string; email: string; role: string }[] }>()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ id: 'u1', email: 'membre1@example.invalid', role: 'club_admin' })
  })

  it('issues a session for a known user', async () => {
    const { db, inserted } = dbWith(user)
    const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json<{ token: string; user: { id: string; clubId?: string } }>()
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
    // A real row in `sessions`, exactly as the OTP path would create.
    expect(inserted.some(([sql]) => String(sql).includes('INSERT INTO sessions'))).toBe(true)
    // The club is what was missing when the picker served mock users.
    expect(body.user).toMatchObject({ id: 'u1', clubId: 'club-1' })
  })

  it('refuses a user that does not exist', async () => {
    const { db } = dbWith(null)
    const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'nope' }),
    })

    expect(res.status).toBe(403)
  })

  // #315 — a member with no address is stored as NULL rather than a fabricated
  // `noemail-…@ppclub.invalid`. The payload must omit the key, not carry null,
  // so the client's `email?: string` stays honest.
  it('omits email entirely for a member who has none', async () => {
    const { db } = dbWith({ ...user, email: null } as unknown as typeof user)
    const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

    const { users } = await res.json<{ users: Record<string, unknown>[] }>()
    expect(users[0]).not.toHaveProperty('email')
    // The rest of the record is untouched.
    expect(users[0]).toMatchObject({ id: 'u1', role: 'club_admin', clubId: 'club-1' })
  })

  it('still issues a session for a member with no address', async () => {
    const { db } = dbWith({ ...user, email: null } as unknown as typeof user)
    const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json<{ token: string; user: Record<string, unknown> }>()
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
    expect(body.user).not.toHaveProperty('email')
  })

  // #345 — anonymisation keeps roles but replaces every name, so the picker
  // needs the club and the captaincy to tell the accounts apart.
  describe('role context for the anonymised picker', () => {
    // A db whose `all()` returns rows verbatim and records the SQL, so the
    // serialisation can be checked independently of SQLite's ordering.
    function dbWithRows(rows: Record<string, unknown>[]) {
      const queries: string[] = []
      return {
        queries,
        db: {
          prepare(sql: string) {
            queries.push(sql)
            return { all: async () => ({ results: rows }) }
          },
        } as unknown as D1Database,
      }
    }

    it('carries the club name and the captained team numbers', async () => {
      const { db } = dbWithRows([
        { ...user, club_name: 'Ping Club', captain_team_numbers: '3,5' },
      ])
      const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      const { users } = await res.json<{ users: Record<string, unknown>[] }>()
      expect(users[0]).toMatchObject({ clubName: 'Ping Club', captainOf: [3, 5] })
    })

    it('sorts the team numbers and copes with a single one arriving as a number', async () => {
      // group_concat yields one value for a single match, and SQLite hands it
      // back typed as a number rather than a string.
      const { db } = dbWithRows([
        { ...user, id: 'u1', captain_team_numbers: 7 },
        { ...user, id: 'u2', captain_team_numbers: '9,2' },
      ])
      const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      const { users } = await res.json<{ users: Record<string, unknown>[] }>()
      expect(users[0].captainOf).toEqual([7])
      expect(users[1].captainOf).toEqual([2, 9])
    })

    it('omits both keys for a member with no club and no captaincy', async () => {
      const { db } = dbWithRows([
        { ...user, club_id: null, club_name: null, captain_team_numbers: null },
      ])
      const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      const { users } = await res.json<{ users: Record<string, unknown>[] }>()
      expect(users[0]).not.toHaveProperty('clubName')
      expect(users[0]).not.toHaveProperty('captainOf')
    })

    it('asks for administrators first', async () => {
      const { db, queries } = dbWithRows([user])
      await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      // An unfiltered list is long; the accounts worth testing must be on top.
      const sql = queries.join(' ').replace(/\s+/g, ' ')
      expect(sql).toContain("WHEN 'general_admin' THEN 0")
      expect(sql).toContain("WHEN 'club_admin' THEN 1")
    })

    it('leaves archived teams out of the captaincy', async () => {
      const { db, queries } = dbWithRows([user])
      await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      const sql = queries.join(' ').replace(/\s+/g, ' ')
      expect(sql).toContain('t.is_archived = 0')
    })

    it('counts captaincy in the active phase only', async () => {
      const { db, queries } = dbWithRows([user])
      await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      // Team numbers repeat from one phase to the next, so an unscoped count
      // showed a long-standing captain of team 5 as "5, 5, 5".
      const sql = queries.join(' ').replace(/\s+/g, ' ')
      expect(sql).toContain('JOIN phases p ON p.id = t.phase_id')
      expect(sql).toContain("p.status = 'active'")
    })

    it('collapses a team number that still arrives more than once', async () => {
      const { db } = dbWithRows([{ ...user, captain_team_numbers: '5,5,5' }])
      const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/users')

      const { users } = await res.json<{ users: Record<string, unknown>[] }>()
      expect(users[0].captainOf).toEqual([5])
    })
  })

  it('rejects a request with no user id', async () => {
    const { db } = dbWith(user)
    const res = await request({ DB: db, DEV_LOGIN_ENABLED: 'true' }, 'dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })
})
