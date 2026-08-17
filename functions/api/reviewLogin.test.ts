import { describe, expect, it } from 'vitest'
import { authApp } from './auth'

// App Store / Play Store review sign-in: one configured account accepts a
// fixed code in place of the emailed one, so a reviewer (who cannot receive our
// email) can get in. The bypass exists ONLY when both REVIEW_LOGIN_EMAIL and
// REVIEW_LOGIN_CODE are set, is scoped to that single email, and still requires
// a real user row — it skips the emailed code, never the account.
const REVIEW_EMAIL = 'clubping.demo@leskno.fr'
const REVIEW_CODE = 'PingReview-2026'

const user = {
  id: 'u-demo', email: REVIEW_EMAIL, role: 'club_admin', is_player: 1,
  first_name: 'Démo', last_name: 'Revue', club_id: 'club-1',
}

// A binding that throws if touched — proves a path returned before any query.
const explodingDb = {
  prepare() {
    throw new Error('the database must not be touched on this path')
  },
} as unknown as D1Database

// Records what ran and answers user/otp/session queries by SQL shape, mirroring
// the real handler's calls. `found` is the users row (or null for no account).
function dbWith(found: typeof user | null) {
  const ran: string[] = []
  return {
    ran,
    db: {
      prepare(sql: string) {
        return {
          bind: () => ({
            first: async () => {
              if (sql.includes('FROM users')) return found
              // auth_otp lookup — empty, as request() never wrote a code here.
              return null
            },
            run: async () => {
              ran.push(sql)
              return { success: true }
            },
          }),
        }
      },
    } as unknown as D1Database,
  }
}

const request = (env: Record<string, unknown>, path: string, body: unknown) =>
  authApp.fetch(
    new Request(`http://localhost/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  )

const configured = { REVIEW_LOGIN_EMAIL: REVIEW_EMAIL, REVIEW_LOGIN_CODE: REVIEW_CODE }

describe('review sign-in — gating', () => {
  // Both vars are required. With only one set, the address is an ordinary one
  // on the normal OTP path — no fixed code is honoured.
  for (const env of [
    { label: 'neither var set', vars: {} },
    { label: 'only the email set', vars: { REVIEW_LOGIN_EMAIL: REVIEW_EMAIL } },
    { label: 'only the code set', vars: { REVIEW_LOGIN_CODE: REVIEW_CODE } },
  ]) {
    it(`does not honour the fixed code when ${env.label}`, async () => {
      const { db } = dbWith(user)
      const res = await request(
        { DB: db, ...env.vars },
        'email/verify',
        { email: REVIEW_EMAIL, code: REVIEW_CODE },
      )
      // Falls through to the OTP table, which is empty → invalid_code.
      expect(res.status).toBe(401)
    })
  }
})

describe('review sign-in — enabled', () => {
  it('signs the account in with the fixed code, without touching auth_otp', async () => {
    const { db, ran } = dbWith(user)
    const res = await request(
      { DB: db, ...configured },
      'email/verify',
      { email: REVIEW_EMAIL, code: REVIEW_CODE },
    )

    expect(res.status).toBe(200)
    const body = await res.json<{ token: string; user: { id: string; clubId?: string } }>()
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
    expect(body.user).toMatchObject({ id: 'u-demo', clubId: 'club-1' })
    // A real session row, exactly as the OTP path would create — and no write
    // to auth_otp, since the code was never emailed.
    expect(ran.some((sql) => sql.includes('INSERT INTO sessions'))).toBe(true)
    expect(ran.some((sql) => sql.includes('auth_otp'))).toBe(false)
  })

  it('matches the review email case-insensitively', async () => {
    const { db } = dbWith(user)
    const res = await request(
      { DB: db, ...configured },
      'email/verify',
      { email: REVIEW_EMAIL.toUpperCase(), code: REVIEW_CODE },
    )
    expect(res.status).toBe(200)
  })

  it('rejects a wrong code for the review account', async () => {
    const { db } = dbWith(user)
    const res = await request(
      { DB: db, ...configured },
      'email/verify',
      { email: REVIEW_EMAIL, code: 'not-the-code' },
    )
    // Falls through to the empty OTP table — indistinguishable from any bad code.
    expect(res.status).toBe(401)
  })

  it('refuses when the account has not been seeded', async () => {
    const { db } = dbWith(null)
    const res = await request(
      { DB: db, ...configured },
      'email/verify',
      { email: REVIEW_EMAIL, code: REVIEW_CODE },
    )
    expect(res.status).toBe(403)
  })

  it('answers the code request as a no-op, sending no email', async () => {
    // The review account gets its code out of band, so requesting one must not
    // reach the database or Resend at all.
    const res = await request(
      { DB: explodingDb, ...configured },
      'email/request',
      { email: REVIEW_EMAIL },
    )
    expect(res.status).toBe(200)
    const body = await res.json<{ ok: boolean; devCode?: string }>()
    expect(body).toEqual({ ok: true })
  })
})
