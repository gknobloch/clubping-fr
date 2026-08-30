import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { needsSession } from './authGuard'

// The home for session-guard coverage (#138). `avatarRoutes.test.ts` pins the
// image exemption from the routes' side — that a broken avatar cannot happen
// again; this pins the guard itself, so the next auth-sensitive route has
// somewhere to say what it expects.
//
// Two levels, because they fail differently: `needsSession` is the path
// decision, exhaustive and cheap, and the fetches below prove the middleware
// actually acts on it — a decision nothing consults protects nothing.

describe('needsSession — the onboarding request (#474)', () => {
  it('lets an anonymous POST ask to administer a club', () => {
    expect(needsSession('POST', '/api/onboarding/requests')).toBe(false)
  })

  // Asking is public; reading the queue and deciding on it are not. Getting
  // this wrong would publish every requester's name, address and phone.
  it('keeps reading and deciding behind the guard', () => {
    expect(needsSession('GET', '/api/onboarding/requests')).toBe(true)
    expect(needsSession('PATCH', '/api/onboarding/requests/req-1')).toBe(true)
    expect(needsSession('DELETE', '/api/onboarding/requests/req-1')).toBe(true)
  })

  it('lets the club confirm from its e-mailed link, with no session', () => {
    expect(needsSession('GET', '/api/onboarding/confirm')).toBe(false)
    expect(needsSession('POST', '/api/onboarding/confirm')).toBe(false)
  })

  it('exempts nothing else under /onboarding', () => {
    expect(needsSession('DELETE', '/api/onboarding/confirm')).toBe(true)
    expect(needsSession('GET', '/api/onboarding/confirmx')).toBe(true)
    expect(needsSession('GET', '/api/onboarding/confirm/extra')).toBe(true)
  })

  it('is anchored, so no neighbouring path inherits the exemption', () => {
    expect(needsSession('POST', '/api/onboarding/requests/req-1')).toBe(true)
    expect(needsSession('POST', '/api/onboarding/requestsx')).toBe(true)
    expect(needsSession('POST', '/api/clubs/x/api/onboarding/requests')).toBe(true)
  })
})

describe('needsSession — public auth paths', () => {
  for (const path of [
    '/api/auth/email/request',
    '/api/auth/email/verify',
    '/api/auth/oauth',
    '/api/auth/dev/users',
    '/api/auth/dev/login',
  ]) {
    it(`lets ${path} through without a session`, () => {
      expect(needsSession('POST', path)).toBe(false)
    })
  }

  it('does not exempt the rest of /api/auth', () => {
    // /auth/me answers about the *current* session, so it is the one auth route
    // that must have one.
    expect(needsSession('GET', '/api/auth/me')).toBe(true)
    expect(needsSession('POST', '/api/auth/logout')).toBe(true)
  })

  it('anchors the match at the start of the path', () => {
    expect(needsSession('POST', '/api/clubs/x/api/auth/oauth')).toBe(true)
  })

  it('does not let a prefix of a public path through', () => {
    // `oauth$` is anchored: /oauth is public, /oauthx is not.
    expect(needsSession('POST', '/api/auth/oauthx')).toBe(true)
    expect(needsSession('POST', '/api/auth/dev')).toBe(true)
  })
})

describe('needsSession — the image exemption', () => {
  for (const path of ['/api/clubs/club-1/logo', '/api/users/u1/avatar']) {
    it(`serves GET ${path} without a session`, () => {
      expect(needsSession('GET', path)).toBe(false)
    })

    it(`still guards writes to ${path}`, () => {
      for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
        expect(needsSession(method, path)).toBe(true)
      }
    })
  }

  it('is exact — a longer or lookalike path is guarded', () => {
    for (const path of [
      '/api/users/u1/avatarx',
      '/api/users/u1/avatar/extra',
      '/api/users/u1/u2/avatar',
      '/api/clubs/club-1/logotype',
      '/api/clubs/club-1/logo/raw',
      '/api/players/u1/avatar', // the pre-#320 path, now gone
    ]) {
      expect(needsSession('GET', path)).toBe(true)
    }
  })

  it('guards everything else, images or not', () => {
    for (const path of ['/api/data', '/api/games/g1', '/api/clubs', '/api/users/u1']) {
      expect(needsSession('GET', path)).toBe(true)
    }
  })
})

// --- The middleware ---------------------------------------------------------

const VALID_TOKEN = 'session-token'
const user = { id: 'u1', email: 'membre@example.invalid', role: 'player' }

/**
 * Enough D1 for `userFromToken`: a sessions lookup and a users lookup. Any
 * other statement returns nothing, which is all the guard's failure paths need.
 */
function dbWithSession(expiresAt: number) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes('FROM sessions')) {
                // The lookup binds both storage forms since #410 — the digest
                // first, then the plaintext for rows minted before it. This row
                // is stored in the old form, so it exercises the fallback.
                return args.includes(VALID_TOKEN)
                  ? { token: VALID_TOKEN, user_id: 'u1', expires_at: expiresAt }
                  : null
              }
              if (sql.includes('FROM users')) return args[0] === 'u1' ? user : null
              return null
            },
            async run() {
              return { success: true }
            },
          }
        },
        async all() {
          return { results: [] }
        },
      }
    },
  } as unknown as D1Database
}

const HOUR = 60 * 60 * 1000
const fetchData = (env: Record<string, unknown>, headers: Record<string, string> = {}) =>
  app.fetch(new Request('http://localhost/api/data', { headers }), env)

describe('the session guard middleware (#98)', () => {
  const db = dbWithSession(Date.now() + HOUR)

  it('rejects a request with no Authorization header', async () => {
    expect((await fetchData({ DB: db })).status).toBe(401)
  })

  it('rejects an unknown token', async () => {
    const res = await fetchData({ DB: db }, { Authorization: 'Bearer not-a-session' })
    expect(res.status).toBe(401)
  })

  it('rejects a token that is not presented as a Bearer', async () => {
    const res = await fetchData({ DB: db }, { Authorization: VALID_TOKEN })
    expect(res.status).toBe(401)
  })

  it('rejects an expired session', async () => {
    const expired = dbWithSession(Date.now() - HOUR)
    const res = await fetchData({ DB: expired }, { Authorization: `Bearer ${VALID_TOKEN}` })
    expect(res.status).toBe(401)
  })

  it('admits a valid session', async () => {
    const res = await fetchData({ DB: db }, { Authorization: `Bearer ${VALID_TOKEN}` })
    expect(res.status).not.toBe(401)
  })
})

describe('AUTH_GUARD_DISABLED (#138)', () => {
  const db = dbWithSession(Date.now() + HOUR)

  it('serves a guarded route with no session when set to the string "true"', async () => {
    const res = await fetchData({ DB: db, AUTH_GUARD_DISABLED: 'true' })
    expect(res.status).not.toBe(401)
  })

  // Only the exact string disables it, so no truthy-looking misconfiguration
  // can open the API by accident — the same rule DEV_LOGIN_ENABLED follows (#313).
  for (const value of [undefined, 'false', '1', 'TRUE', 'yes', '']) {
    it(`keeps the guard on when set to ${JSON.stringify(value)}`, async () => {
      const res = await fetchData({ DB: db, AUTH_GUARD_DISABLED: value })
      expect(res.status).toBe(401)
    })
  }
})
