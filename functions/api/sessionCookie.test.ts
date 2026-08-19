// @vitest-environment node
//
// Node, not the default happy-dom: `Cookie` and `Set-Cookie` are forbidden
// header names in a browser, and happy-dom drops them — every assertion here
// would pass or fail for reasons that have nothing to do with the code.
import { describe, expect, it } from 'vitest'
import { authApp, requestToken, sessionCookie, sessionCookieHeader, SESSION_COOKIE } from './auth'
import { app } from './[[path]]'

// ---------------------------------------------------------------------------
// Session cookie (#370)
//
// The web kept its session in localStorage alone, which Safari deletes after
// 7 days without a first-party visit — members came back to a login screen
// while the session still had weeks to run. The cookie is what survives that,
// so what it carries and how it is cleared are worth pinning down.
// ---------------------------------------------------------------------------

describe('sessionCookie — reading the Cookie header', () => {
  it('finds the session among other cookies', () => {
    expect(sessionCookie(`theme=dark; ${SESSION_COOKIE}=abc123; lang=fr`)).toBe('abc123')
  })

  it('reads it first, last or alone', () => {
    expect(sessionCookie(`${SESSION_COOKIE}=abc123`)).toBe('abc123')
    expect(sessionCookie(`${SESSION_COOKIE}=abc123; theme=dark`)).toBe('abc123')
    expect(sessionCookie(`theme=dark; ${SESSION_COOKIE}=abc123`)).toBe('abc123')
  })

  it('is absent rather than empty when there is no session', () => {
    expect(sessionCookie(undefined)).toBeNull()
    expect(sessionCookie('')).toBeNull()
    expect(sessionCookie('theme=dark')).toBeNull()
    // The cleared cookie, before the browser drops it.
    expect(sessionCookie(`${SESSION_COOKIE}=`)).toBeNull()
  })

  it('does not match a cookie whose name merely ends with ours', () => {
    // `x_cp_session=` contains the name; a substring match would take it.
    expect(sessionCookie(`x_${SESSION_COOKIE}=nottheone`)).toBeNull()
  })
})

describe('sessionCookieHeader — what the browser is told', () => {
  const attrs = (header: string) => header.split(';').map((s) => s.trim())

  it('carries the token, HttpOnly and SameSite=Lax', () => {
    const header = sessionCookieHeader('tok', 'https://clubping.fr/api/auth/email/verify')
    expect(header.startsWith(`${SESSION_COOKIE}=tok;`)).toBe(true)
    // HttpOnly is the point of the change beyond persistence: no script on the
    // page can read the session. Lax means it never rides a cross-site POST.
    expect(attrs(header)).toContain('HttpOnly')
    expect(attrs(header)).toContain('SameSite=Lax')
    expect(attrs(header)).toContain('Path=/')
  })

  it('lasts as long as the session itself — 30 days', () => {
    const header = sessionCookieHeader('tok', 'https://clubping.fr/x')
    expect(attrs(header)).toContain(`Max-Age=${30 * 24 * 60 * 60}`)
  })

  it('is Secure over https', () => {
    expect(attrs(sessionCookieHeader('tok', 'https://clubping.fr/x'))).toContain('Secure')
  })

  it('is not Secure over http, or local dev could never exercise it', () => {
    // `npm run dev:full` serves http://localhost:8788; a Secure cookie there is
    // dropped, and the fix would look broken on the machine testing it.
    expect(attrs(sessionCookieHeader('tok', 'http://localhost:8788/x'))).not.toContain('Secure')
  })

  it('clears with an empty value and Max-Age=0', () => {
    const header = sessionCookieHeader(null, 'https://clubping.fr/api/auth/logout')
    expect(header.startsWith(`${SESSION_COOKIE}=;`)).toBe(true)
    expect(attrs(header)).toContain('Max-Age=0')
    expect(attrs(header)).toContain('HttpOnly')
  })
})

describe('requestToken — either credential', () => {
  const req = (headers: Record<string, string>) => ({
    header: (name: string) => headers[name],
  })

  it('takes the Bearer token (mobile)', () => {
    expect(requestToken(req({ Authorization: 'Bearer mobile-tok' }))).toBe('mobile-tok')
  })

  it('takes the cookie (web)', () => {
    expect(requestToken(req({ Cookie: `${SESSION_COOKIE}=web-tok` }))).toBe('web-tok')
  })

  it('prefers the Bearer token when both are present', () => {
    // A native webview could carry a stale cookie; the explicit credential wins.
    const token = requestToken(
      req({ Authorization: 'Bearer mobile-tok', Cookie: `${SESSION_COOKIE}=web-tok` }),
    )
    expect(token).toBe('mobile-tok')
  })

  it('is null with neither', () => {
    expect(requestToken(req({}))).toBeNull()
  })
})

// --- Against the routes -----------------------------------------------------

const VALID = 'session-token'
const user = { id: 'u1', email: 'membre@example.invalid', role: 'player', is_player: 1 }

/** Enough D1 for a dev login and for userFromToken. */
function db() {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes('FROM sessions')) {
                // Both storage forms are bound since #410; this row is in the
                // pre-#410 plaintext form.
                return args.includes(VALID)
                  ? { token: VALID, user_id: 'u1', expires_at: Date.now() + 60_000 }
                  : null
              }
              if (sql.includes('FROM users')) return user
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

describe('the routes', () => {
  it('sets the cookie when a session is minted', async () => {
    const res = await authApp.fetch(
      new Request('https://clubping.fr/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u1' }),
      }),
      { DB: db(), DEV_LOGIN_ENABLED: 'true' },
    )

    expect(res.status).toBe(200)
    const setCookie = res.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain(`${SESSION_COOKIE}=`)
    expect(setCookie).toContain('HttpOnly')
    // The body still carries the token: the mobile app has no cookie jar.
    expect((await res.json<{ token: string }>()).token).toBeTruthy()
  })

  it('clears the cookie on logout', async () => {
    const res = await authApp.fetch(
      new Request('https://clubping.fr/logout', {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${VALID}` },
      }),
      { DB: db() },
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0')
  })

  it('answers /me from the cookie alone', async () => {
    // The whole point: a browser that lost its localStorage entry still knows
    // who it is, so nothing asks the member for a code again.
    const res = await authApp.fetch(
      new Request('https://clubping.fr/me', { headers: { Cookie: `${SESSION_COOKIE}=${VALID}` } }),
      { DB: db() },
    )

    expect(res.status).toBe(200)
    expect((await res.json<{ user: { id: string } }>()).user.id).toBe('u1')
  })
})

describe('the session guard', () => {
  const get = (headers: Record<string, string>) =>
    app.fetch(new Request('https://clubping.fr/api/data', { headers }), { DB: db() })

  it('accepts the cookie', async () => {
    expect((await get({ Cookie: `${SESSION_COOKIE}=${VALID}` })).status).toBe(200)
  })

  it('still accepts a Bearer token', async () => {
    expect((await get({ Authorization: `Bearer ${VALID}` })).status).toBe(200)
  })

  it('rejects an unknown cookie value', async () => {
    expect((await get({ Cookie: `${SESSION_COOKIE}=nope` })).status).toBe(401)
  })

  it('rejects a request carrying neither', async () => {
    expect((await get({})).status).toBe(401)
  })
})
