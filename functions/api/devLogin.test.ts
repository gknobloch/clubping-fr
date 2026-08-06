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
