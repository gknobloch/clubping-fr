import { Hono } from 'hono'
import type { Context } from 'hono'
import type { UserRow } from './rows'

// Shared environment for the whole API. Secrets/vars are configured as
// Cloudflare Pages bindings (see wrangler.toml notes).
export type Env = {
  Bindings: {
    DB: D1Database
    RESEND_API_KEY?: string
    RESEND_FROM?: string
    GOOGLE_CLIENT_IDS?: string // comma-separated accepted audiences
    APPLE_CLIENT_IDS?: string // comma-separated accepted audiences
    // When 'true', the session guard is bypassed (local dev only — set in
    // .dev.vars so the dev user-picker login works without a real session).
    AUTH_GUARD_DISABLED?: string
    // When 'true', /auth/dev/* will list users and mint sessions without any
    // credential. Set ONLY on the preview environment, whose database is
    // anonymised (#313) — in production it is a complete authentication
    // bypass. wrangler.toml keeps it out of the top-level [vars], and
    // src/test/workflows.spec.ts fails the build if it ever appears there.
    DEV_LOGIN_ENABLED?: string
    // App Store / Play Store review sign-in. The stores demand a working
    // login, but a reviewer cannot receive our emailed one-time code (the app
    // is passwordless). This designated account accepts REVIEW_LOGIN_CODE in
    // place of the emailed code — nothing else changes, and it is scoped to
    // this one email. Both must be set (as production Pages *secrets*) for the
    // bypass to exist; the same pair goes in the store's review notes. The
    // account must still be a real user row: only the emailed code is skipped.
    REVIEW_LOGIN_EMAIL?: string
    REVIEW_LOGIN_CODE?: string
  }
  Variables: {
    user: UserRow
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const OTP_MAX_ATTEMPTS = 5
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const OAUTH_PROVIDERS = {
  google: {
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    audEnv: 'GOOGLE_CLIENT_IDS' as const,
  },
  apple: {
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audEnv: 'APPLE_CLIENT_IDS' as const,
  },
}
type Provider = keyof typeof OAUTH_PROVIDERS

// ---------------------------------------------------------------------------
// Crypto / encoding helpers
// ---------------------------------------------------------------------------
const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)))
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 6-digit numeric one-time code, zero-padded. */
export function genOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

/** Hash an OTP bound to the email so codes are not interchangeable across users. */
export function hashOtp(email: string, code: string): Promise<string> {
  return sha256Hex(`${email.toLowerCase()}:${code}`)
}

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeJwtPart(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)))
}

// ---------------------------------------------------------------------------
// OIDC ID-token verification (Google / Apple) — RS256 via Web Crypto, no deps
// ---------------------------------------------------------------------------
interface Jwk {
  kid: string
  kty: string
  alg?: string
  use?: string
  n: string
  e: string
}

export interface OidcClaims {
  sub: string
  email?: string
  email_verified?: boolean | string
  [k: string]: unknown
}

interface VerifyOpts {
  jwksUrl: string
  issuers: string[]
  audiences: string[]
  fetchJwks?: (url: string) => Promise<{ keys: Jwk[] }>
  now?: number
}

/**
 * Verify a signed OIDC ID token (RS256) and return its claims.
 * Checks signature against the provider JWKS, plus iss / aud / exp.
 * Throws on any failure.
 */
export async function verifyOidcJwt(idToken: string, opts: VerifyOpts): Promise<OidcClaims> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const [headerB64, payloadB64, sigB64] = parts

  const header = decodeJwtPart(headerB64) as { kid?: string; alg?: string }
  if (header.alg !== 'RS256') throw new Error('unsupported alg')

  const fetchJwks =
    opts.fetchJwks ??
    (async (url: string) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error('jwks fetch failed')
      return (await r.json()) as { keys: Jwk[] }
    })
  const { keys } = await fetchJwks(opts.jwksUrl)
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new Error('signing key not found')

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(sigB64),
    enc.encode(`${headerB64}.${payloadB64}`),
  )
  if (!valid) throw new Error('bad signature')

  const claims = decodeJwtPart(payloadB64) as OidcClaims & { iss?: string; aud?: string | string[]; exp?: number }
  const now = opts.now ?? Date.now()
  if (!claims.iss || !opts.issuers.includes(claims.iss)) throw new Error('bad issuer')
  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
  if (!auds.some((a) => opts.audiences.includes(a))) throw new Error('bad audience')
  if (!claims.exp || claims.exp * 1000 <= now) throw new Error('token expired')

  return claims
}

// ---------------------------------------------------------------------------
// Email (Resend)
// ---------------------------------------------------------------------------
/**
 * Send the OTP code by email. When RESEND_API_KEY is absent (local dev), the
 * code is logged instead of sent — callers also surface it as `devCode`.
 */
async function sendOtpEmail(env: Env['Bindings'], to: string, code: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[auth] OTP for ${to}: ${code}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? 'Club Ping <onboarding@resend.dev>',
      to: [to],
      subject: `Votre code de connexion : ${code}`,
      text: `Votre code de connexion Club Ping est : ${code}\n\nIl expire dans 10 minutes.`,
    }),
  })
  if (!res.ok) {
    console.error('[auth] Resend send failed', res.status, await res.text())
    throw new Error('email_send_failed')
  }
}

// ---------------------------------------------------------------------------
// Users / sessions
// ---------------------------------------------------------------------------
// UserRow used to be declared here, looser (role and status as plain strings).
// It moved to rows.ts in #285 so the users table has one shape shared with the
// rest of the API rather than two that can drift apart.

function serializeUser(r: UserRow) {
  return {
    id: r.id,
    role: r.role,
    isPlayer: r.is_player === 1,
    // Omitted rather than sent as null when the member has no address (#315),
    // matching every other optional field below and the client's `email?`.
    ...(r.email ? { email: r.email } : {}),
    ...(r.first_name ? { firstName: r.first_name } : {}),
    ...(r.last_name ? { lastName: r.last_name } : {}),
    ...(r.license_number ? { licenseNumber: r.license_number } : {}),
    ...(r.phone ? { phone: r.phone } : {}),
    ...(r.birth_date ? { birthDate: r.birth_date } : {}),
    ...(r.birth_place ? { birthPlace: r.birth_place } : {}),
    ...(r.status ? { status: r.status } : {}),
    ...(r.club_id ? { clubId: r.club_id } : {}),
  }
}

async function userByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
    .bind(email)
    .first<UserRow>()
}

/**
 * What goes in `sessions.token` (#410): the SHA-256 of the value the client
 * holds, never the value itself.
 *
 * The table next door already worked this way — `auth_otp` stores a `code_hash`
 * for a code that lives ten minutes, while the session token, good for thirty
 * days, was kept in the clear. Anyone able to read the database held a usable
 * bearer credential for every signed-in member; a digest cannot be replayed.
 *
 * No salt and no KDF: the token is 32 random bytes (see `randomToken`), so
 * there is no low-entropy secret to grind at. This is lookup-key hardening,
 * not password storage.
 */
const sessionKey = (token: string) => sha256Hex(token)

/**
 * Match a session under either storage form, each arm checking the form it
 * means (#410).
 *
 * The second arm is the transition: rows minted before this change hold the
 * plaintext token, and dropping them would have signed the whole club out — D1
 * exposes no hash function, so they cannot be rewritten in place. Every login
 * from here writes a digest, SESSION_TTL_MS caps the old rows at 30 days, and
 * #409's purge clears them sooner. Phase 3 drops the arm and the column.
 *
 * `token_hashed` is what keeps the fallback from undoing the change. A plain
 * `token = digest OR token = presented` also matches a HASHED row when someone
 * replays the stored value verbatim — which would leave a database read
 * yielding a working credential, exactly what this stops.
 *
 * Returns the matched row's key and form, because the caller has to delete the
 * row it actually matched.
 */
const SESSION_BY_TOKEN =
  'SELECT token, token_hashed, user_id, expires_at FROM sessions' +
  ' WHERE (token = ? AND token_hashed = 1) OR (token = ? AND token_hashed = 0)'

interface SessionRow {
  token: string
  token_hashed: number
  user_id: string
  expires_at: number
}

async function sessionByToken(db: D1Database, token: string) {
  return db
    .prepare(SESSION_BY_TOKEN)
    .bind(await sessionKey(token), token)
    .first<SessionRow>()
}

async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken()
  const now = Date.now()
  await db
    .prepare(
      'INSERT INTO sessions (token, token_hashed, user_id, created_at, expires_at)' +
      ' VALUES (?, 1, ?, ?, ?)',
    )
    .bind(await sessionKey(token), userId, now, now + SESSION_TTL_MS)
    .run()
  // Expired sessions were never swept (#409): rows left only at logout, or
  // lazily when a dead token happened to be presented again, so a session that
  // quietly lapsed stayed for good — production still held rows from June.
  // Signing in is the natural moment to tidy up after this member. Bounded by
  // expires_at, so their live sessions on other devices are untouched.
  await db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?')
    .bind(userId, now)
    .run()
  // The session row is not the record of this (#406): it is deleted at logout
  // and gone after 30 days, so a club that shared the app could not tell a
  // member who tried it once from one who never opened the link. COALESCE is
  // what makes first_login_at the FIRST login rather than the latest.
  await db
    .prepare('UPDATE users SET first_login_at = COALESCE(first_login_at, ?), last_seen_at = ? WHERE id = ?')
    .bind(now, now, userId)
    .run()
  return token
}

/**
 * How stale `users.last_seen_at` may get before a request refreshes it (#406).
 *
 * Every authenticated request passes through the guard, so writing there
 * unconditionally would put a D1 write in front of every page load — for a
 * value read as a date on one admin screen. An hour bounds it to one write per
 * member per hour and still answers the question anyone asks of it ("did they
 * come back this week?").
 */
const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000

/**
 * Bring `last_seen_at` up to date if it has gone stale, mutating the row so the
 * rest of the request sees the value it just wrote.
 */
async function touchLastSeen(db: D1Database, user: UserRow): Promise<void> {
  const now = Date.now()
  // `typeof` rather than a null check: a database still missing the 0039
  // columns hands back undefined, and treating that as "fresh" would leave the
  // column empty for good.
  if (typeof user.last_seen_at === 'number' && now - user.last_seen_at < LAST_SEEN_REFRESH_MS) return
  await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, user.id).run()
  user.last_seen_at = now
}

export function bearer(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// Session cookie (#370)
//
// The web used to keep the session in localStorage alone. Safari caps
// script-writable storage and deletes it after 7 days without a first-party
// visit, so members came back to a login screen while their session still had
// weeks to run — the browser had thrown away the key, not the server the lock.
// A cookie set by the server is not subject to that cap.
//
// HttpOnly, so no script on the page can read the session; SameSite=Lax, so it
// rides along on top-level navigations but never on a cross-site POST, which
// is what keeps cookie auth from being a CSRF hole.
//
// The mobile app stays on Bearer: a native client has no cookie jar to lean
// on, and SecureStore is subject to none of this.
// ---------------------------------------------------------------------------
export const SESSION_COOKIE = 'cp_session'

/** The session token carried by a request's Cookie header, if any. */
export function sessionCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    return value ? decodeURIComponent(value) : null
  }
  return null
}

/** The credential on a request, from either scheme. */
export function requestToken(req: {
  header(name: string): string | undefined
}): string | null {
  return bearer(req.header('Authorization')) ?? sessionCookie(req.header('Cookie'))
}

/**
 * `Set-Cookie` carrying the session, or clearing it when `token` is null.
 *
 * `Secure` follows the request's scheme rather than being unconditional: a
 * local `npm run dev:full` serves http, and Safari drops a Secure cookie there
 * — which would silently un-fix this on the machine where it gets tested.
 */
export function sessionCookieHeader(token: string | null, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : ''
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure}`
  return token
    ? `${SESSION_COOKIE}=${token}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; ${attrs}`
    : `${SESSION_COOKIE}=; Max-Age=0; ${attrs}`
}

export async function userFromToken(db: D1Database, token: string): Promise<UserRow | null> {
  const session = await sessionByToken(db, token)
  if (!session) return null
  if (session.expires_at <= Date.now()) {
    // By the key and form actually matched, not the presented value: a hashed
    // row would not match the plaintext, and the row would outlive its own
    // expiry, to be re-checked and re-skipped forever (#410).
    await db
      .prepare('DELETE FROM sessions WHERE token = ? AND token_hashed = ?')
      .bind(session.token, session.token_hashed)
      .run()
    return null
  }
  const user = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(session.user_id)
    .first<UserRow>()
  // Every authenticated request lands here, which makes it the one place that
  // knows a member is still using the app between sign-ins (#406). Throttled —
  // see LAST_SEEN_REFRESH_MS.
  if (user) await touchLastSeen(db, user)
  return user
}

// ---------------------------------------------------------------------------
// Routes (mounted at /api/auth)
// ---------------------------------------------------------------------------
export const authApp = new Hono<Env>()

/**
 * The answer to every successful sign-in: the session as a cookie for the web
 * (#370) and in the body for the mobile app, which stores it in SecureStore.
 * Routing them both through here is what stops a new sign-in path from minting
 * a session and forgetting the cookie.
 */
function sessionResponse(c: Context<Env>, token: string, user: UserRow) {
  c.header('Set-Cookie', sessionCookieHeader(token, c.req.url))
  return c.json({ token, user: serializeUser(user) })
}

// The store-review account, if configured (see the Env type). Both the email
// and the code must be set for the bypass to exist at all — otherwise
// REVIEW_LOGIN_EMAIL is just an ordinary address on the normal OTP path.
const reviewLoginConfigured = (env: Env['Bindings']) =>
  !!env.REVIEW_LOGIN_EMAIL && !!env.REVIEW_LOGIN_CODE

const isReviewEmail = (env: Env['Bindings'], email: string) =>
  reviewLoginConfigured(env) && email.toLowerCase() === env.REVIEW_LOGIN_EMAIL!.toLowerCase()

// Request an email OTP. Always returns ok (don't leak account existence).
authApp.post('/email/request', async (c) => {
  const { email } = await c.req.json<{ email?: string }>()
  if (!email || !email.includes('@')) return c.json({ error: 'invalid_email' }, 400)

  // The review account never receives an email: its code is fixed and set out
  // of band, so requesting one is a no-op the reviewer can tap through.
  if (isReviewEmail(c.env, email)) return c.json({ ok: true })

  const user = await userByEmail(c.env.DB, email)
  // Only generate/send a code when an account exists, but respond identically.
  if (!user) return c.json({ ok: true })

  const code = genOtp()
  const codeHash = await hashOtp(email, code)
  await c.env.DB.prepare(
    `INSERT INTO auth_otp (email, code_hash, expires_at, attempts)
     VALUES (lower(?), ?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
  )
    .bind(email, codeHash, Date.now() + OTP_TTL_MS)
    .run()

  await sendOtpEmail(c.env, email, code)

  // In local dev (no Resend key) return the code so the flow is testable.
  return c.json(c.env.RESEND_API_KEY ? { ok: true } : { ok: true, devCode: code })
})

// Verify an email OTP and create a session.
authApp.post('/email/verify', async (c) => {
  const { email, code } = await c.req.json<{ email?: string; code?: string }>()
  if (!email || !code) return c.json({ error: 'invalid_request' }, 400)

  // Store-review bypass: the fixed code stands in for the emailed one, for the
  // one configured account only. A real user row is still required, so this
  // grants no more access than the account itself has. A wrong code falls
  // through and fails on the empty OTP table below, as any bad code would.
  if (isReviewEmail(c.env, email) && code === c.env.REVIEW_LOGIN_CODE) {
    const user = await userByEmail(c.env.DB, email)
    if (!user) return c.json({ error: 'no_account' }, 403)
    const token = await createSession(c.env.DB, user.id)
    return sessionResponse(c, token, user)
  }

  const row = await c.env.DB.prepare(
    'SELECT code_hash, expires_at, attempts FROM auth_otp WHERE email = lower(?)',
  )
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>()

  if (!row || row.expires_at <= Date.now()) return c.json({ error: 'invalid_code' }, 401)
  if (row.attempts >= OTP_MAX_ATTEMPTS) return c.json({ error: 'too_many_attempts' }, 429)

  const codeHash = await hashOtp(email, code)
  if (codeHash !== row.code_hash) {
    await c.env.DB.prepare('UPDATE auth_otp SET attempts = attempts + 1 WHERE email = lower(?)')
      .bind(email)
      .run()
    return c.json({ error: 'invalid_code' }, 401)
  }

  const user = await userByEmail(c.env.DB, email)
  if (!user) return c.json({ error: 'no_account' }, 403)

  await c.env.DB.prepare('DELETE FROM auth_otp WHERE email = lower(?)').bind(email).run()
  const token = await createSession(c.env.DB, user.id)
  return sessionResponse(c, token, user)
})

// Sign in with a Google/Apple ID token.
authApp.post('/oauth', async (c) => {
  const { provider, idToken } = await c.req.json<{ provider?: string; idToken?: string }>()
  if (!provider || !idToken || !(provider in OAUTH_PROVIDERS)) {
    return c.json({ error: 'invalid_request' }, 400)
  }
  const cfg = OAUTH_PROVIDERS[provider as Provider]
  const audiences = (c.env[cfg.audEnv] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (audiences.length === 0) return c.json({ error: 'provider_not_configured' }, 500)

  let claims: OidcClaims
  try {
    claims = await verifyOidcJwt(idToken, { jwksUrl: cfg.jwksUrl, issuers: cfg.issuers, audiences })
  } catch (e) {
    console.error('[auth] oauth verify failed', (e as Error).message)
    return c.json({ error: 'invalid_token' }, 401)
  }

  const db = c.env.DB
  // Prefer an existing identity link, else match by email.
  const link = await db
    .prepare('SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?')
    .bind(provider, claims.sub)
    .first<{ user_id: string }>()

  let user: UserRow | null = null
  if (link) {
    user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(link.user_id).first<UserRow>()
  } else if (claims.email) {
    user = await userByEmail(db, claims.email)
    if (user) {
      await db
        .prepare('INSERT OR IGNORE INTO auth_identities (provider, subject, user_id) VALUES (?, ?, ?)')
        .bind(provider, claims.sub, user.id)
        .run()
    }
  }

  if (!user) return c.json({ error: 'no_account' }, 403)
  const token = await createSession(db, user.id)
  return sessionResponse(c, token, user)
})

// Current user from either credential — the cookie is how the web restores a
// session it no longer holds a token for (#370).
authApp.get('/me', async (c) => {
  const token = requestToken(c.req)
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const user = await userFromToken(c.env.DB, token)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ user: serializeUser(user) })
})

// Revoke the current session: the row goes, and so does the cookie — leaving
// it would send a dead credential on every subsequent request.
authApp.post('/logout', async (c) => {
  const token = requestToken(c.req)
  // Both storage forms, so a session minted before #410 still revokes.
  if (token) {
    await c.env.DB
      .prepare(
        'DELETE FROM sessions' +
        ' WHERE (token = ? AND token_hashed = 1) OR (token = ? AND token_hashed = 0)',
      )
      .bind(await sessionKey(token), token)
      .run()
  }
  c.header('Set-Cookie', sessionCookieHeader(null, c.req.url))
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Dev login — preview deployments only (#313)
// ---------------------------------------------------------------------------
//
// Previews are a production build against a real backend, so the client-side
// "pick any user" login cannot work: it mints no session, and every API call
// is rejected. These two endpoints give the picker a real session instead.
//
// Both are a deliberate authentication bypass and exist ONLY where
// DEV_LOGIN_ENABLED is 'true' — the preview environment, whose database is
// anonymised. Anywhere else they answer 404, so the feature is invisible
// rather than merely refused.
const devLoginEnabled = (env: Env['Bindings']) => env.DEV_LOGIN_ENABLED === 'true'

// A user row plus the two derived columns the picker needs. Both come from the
// LEFT JOIN / subquery below, so both are absent for a member with no club and
// no captaincy — and undefined when a caller hands us a plain user row.
type DevUserRow = UserRow & {
  club_name?: string | null
  captain_team_numbers?: string | null
}

function serializeDevUser(r: DevUserRow) {
  // group_concat gives '3,5' (or NULL when the member captains nothing). D1
  // types the column as string, but SQLite hands back a number when a single
  // team matches, so coerce before splitting.
  const captainOf = r.captain_team_numbers
    ? [
        ...new Set(
          String(r.captain_team_numbers)
            .split(',')
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n)),
        ),
      ].sort((a, b) => a - b)
    : []
  return {
    ...serializeUser(r),
    ...(r.club_name ? { clubName: r.club_name } : {}),
    ...(captainOf.length > 0 ? { captainOf } : {}),
  }
}

// The picker's list. Deliberately the preview database's own users, not the
// mock fixtures — logging in as somebody who does not exist there is what made
// every screen come up empty.
//
// Anonymisation (#313) keeps roles but replaces every name with a pseudonym, so
// the list alone no longer says who administers what (#345). Each row therefore
// carries the club name and the teams the member captains — captaincy is
// derived from teams.captain_id, which the client cannot see before signing in.
authApp.get('/dev/users', async (c) => {
  if (!devLoginEnabled(c.env)) return c.json({ error: 'not_found' }, 404)
  const { results } = await c.env.DB.prepare(
    `SELECT u.*,
            c.display_name AS club_name,
            -- Scoped to the active phase (at most one at a time, across
            -- seasons). Unscoped, a captain who has held team 5 for three
            -- phases came back as "5, 5, 5", and past captaincies are not what
            -- one is about to test anyway.
            (SELECT group_concat(t.number)
               FROM teams t
               JOIN phases p ON p.id = t.phase_id
              WHERE t.captain_id = u.id
                AND t.is_archived = 0
                AND p.status = 'active') AS captain_team_numbers
       FROM users u
       LEFT JOIN clubs c ON c.id = u.club_id
      ORDER BY CASE u.role
                 WHEN 'general_admin' THEN 0
                 WHEN 'club_admin' THEN 1
                 ELSE 2
               END,
               u.last_name, u.first_name, u.email`,
  ).all<DevUserRow>()
  return c.json({ users: (results ?? []).map(serializeDevUser) })
})

// Sign in as any user, with no credential. Issues exactly the same session as
// the OTP and OAuth paths, so everything downstream is unchanged.
authApp.post('/dev/login', async (c) => {
  if (!devLoginEnabled(c.env)) return c.json({ error: 'not_found' }, 404)
  const { userId } = await c.req.json<{ userId?: string }>()
  if (!userId) return c.json({ error: 'invalid_user' }, 400)
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>()
  if (!user) return c.json({ error: 'no_account' }, 403)
  const token = await createSession(c.env.DB, user.id)
  return sessionResponse(c, token, user)
})
