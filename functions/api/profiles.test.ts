// @vitest-environment node
//
// Node, not happy-dom, which drops `Set-Cookie` as a forbidden header name —
// and a switch has to hand the web its new session as a cookie (#370).
import { describe, expect, it } from 'vitest'
import { authApp, hashOtp, sameAddress, sessionKey } from './auth'

// #640 — one address, several profiles: a parent and a child sharing the
// parent's. Signing in opens the profile used last, the session names the
// others, and switching to one of them is signing in again, as that profile,
// without a second code — for the profiles of that address and nobody else.

const CODE = '123456'

interface Member {
  id: string
  email: string | null
  first_name: string
  last_name: string
  role: string
  club_id: string | null
  status: string
  last_seen_at: number | null
}

const member = (over: Partial<Member> & Pick<Member, 'id'>): Member => ({
  email: 'henaut@example.fr', first_name: 'X', last_name: 'Henaut', role: 'player',
  club_id: 'club-a', status: 'active', last_seen_at: null, ...over,
})

const benjamin = member({ id: 'benjamin', first_name: 'Benjamin', email: 'Henaut@example.fr', last_seen_at: 2_000 })
const sacha = member({ id: 'sacha', first_name: 'Sacha', club_id: 'club-b', last_seen_at: 1_000 })
const stranger = member({ id: 'stranger', first_name: 'Zoé', last_name: 'Roy', email: 'zoe@example.fr' })
const clubs: Record<string, string> = { 'club-a': 'PPA Rixheim', 'club-b': 'CSS Bergheim' }

/** Enough D1 for sign-in, /me and /switch, answering by SQL shape. */
async function fakeDb(users: Member[]) {
  const sessions = new Map<string, string>() // digest → user id
  const otp = { code_hash: await hashOtp('henaut@example.fr', CODE), expires_at: Date.now() + 60_000, attempts: 0 }
  const byAddress = (email: unknown) =>
    users.filter((u) => !!u.email && u.email.toLowerCase() === String(email).toLowerCase())

  const db = {
    prepare(sql: string) {
      return {
        bind: (...params: unknown[]) => ({
          async first() {
            if (sql.includes('FROM auth_otp')) return otp
            if (sql.includes('FROM sessions')) {
              const userId = sessions.get(String(params[0]))
              return userId ? { token: params[0], user_id: userId, expires_at: Date.now() + 60_000 } : null
            }
            if (sql.includes('FROM users WHERE id = ?')) return users.find((u) => u.id === params[0]) ?? null
            if (sql.includes('lower(email) = lower(?)')) {
              // Most recently seen first, then by id — the ORDER BY of the query.
              return [...byAddress(params[0])].sort((a, b) =>
                (b.last_seen_at ?? 0) - (a.last_seen_at ?? 0) || a.id.localeCompare(b.id))[0] ?? null
            }
            return null
          },
          async all() {
            if (sql.includes('LEFT JOIN clubs')) {
              const [id, email] = params
              const rows = users.filter((u) => u.id === id || (email !== '' && byAddress(email).includes(u)))
              return { results: rows.map((u) => ({ ...u, club_name: u.club_id ? clubs[u.club_id] : null })) }
            }
            return { results: [] }
          },
          async run() {
            if (sql.startsWith('INSERT INTO sessions')) sessions.set(String(params[0]), String(params[1]))
            if (sql.startsWith('DELETE FROM sessions WHERE token = ?')) sessions.delete(String(params[0]))
            return { success: true }
          },
        }),
      }
    },
  } as unknown as D1Database
  return { db, sessions }
}

const post = (db: D1Database, path: string, body: unknown, token?: string) =>
  authApp.fetch(
    new Request(`http://localhost/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    { DB: db },
  )

interface SessionBody {
  token: string
  user: { id: string }
  profiles: Array<{ id: string; firstName?: string; clubName?: string }>
}

async function signIn(db: D1Database): Promise<SessionBody> {
  const res = await post(db, 'email/verify', { email: 'henaut@example.fr', code: CODE })
  expect(res.status).toBe(200)
  return res.json()
}

describe('signing in with an address several profiles share', () => {
  it('opens the profile used most recently', async () => {
    const { db } = await fakeDb([sacha, benjamin])
    expect((await signIn(db)).user.id).toBe('benjamin')
  })

  it('opens the child’s when the phone was last the child’s', async () => {
    const { db } = await fakeDb([{ ...sacha, last_seen_at: 3_000 }, benjamin])
    expect((await signIn(db)).user.id).toBe('sacha')
  })

  it('names every profile of the address, signed-in one first, clubs named', async () => {
    const { db } = await fakeDb([benjamin, sacha, stranger])
    const body = await signIn(db)
    expect(body.profiles.map((p) => p.id)).toEqual(['benjamin', 'sacha'])
    expect(body.profiles[1]).toMatchObject({ firstName: 'Sacha', clubName: 'CSS Bergheim' })
  })

  it('answers /me with the profiles too — a restored session never saw the sign-in', async () => {
    const { db } = await fakeDb([benjamin, sacha])
    const { token } = await signIn(db)
    const res = await authApp.fetch(
      new Request('http://localhost/me', { headers: { Authorization: `Bearer ${token}` } }),
      { DB: db },
    )
    const body = (await res.json()) as SessionBody
    expect(body.profiles.map((p) => p.id)).toEqual(['benjamin', 'sacha'])
  })
})

describe('switching profile', () => {
  it('becomes the other profile, in a fresh session, and revokes the old one', async () => {
    const { db, sessions } = await fakeDb([benjamin, sacha])
    const { token } = await signIn(db)
    const res = await post(db, 'switch', { userId: 'sacha' }, token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as SessionBody
    expect(body.user.id).toBe('sacha')
    expect(body.token).not.toBe(token)
    expect(res.headers.get('Set-Cookie')).toContain(`cp_session=${body.token}`)
    // One session on the device, and it is Sacha's.
    expect(sessions.has(await sessionKey(token))).toBe(false)
    expect(sessions.get(await sessionKey(body.token))).toBe('sacha')
  })

  it('refuses a member of another address, and leaves the session alone', async () => {
    const { db, sessions } = await fakeDb([benjamin, sacha, stranger])
    const { token } = await signIn(db)
    const res = await post(db, 'switch', { userId: 'stranger' }, token)
    expect(res.status).toBe(403)
    expect(sessions.get(await sessionKey(token))).toBe('benjamin')
  })

  it('refuses an unknown id exactly as it refuses a stranger', async () => {
    const { db } = await fakeDb([benjamin, sacha])
    const { token } = await signIn(db)
    const res = await post(db, 'switch', { userId: 'nobody' }, token)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed' })
  })

  it('reads the address now — a child given their own is out of reach', async () => {
    const users = [benjamin, sacha]
    const { db } = await fakeDb(users)
    const { token } = await signIn(db)
    users[1] = { ...sacha, email: 'sacha@example.fr' }
    expect((await post(db, 'switch', { userId: 'sacha' }, token)).status).toBe(403)
  })

  it('needs a session', async () => {
    const { db } = await fakeDb([benjamin, sacha])
    expect((await post(db, 'switch', { userId: 'sacha' })).status).toBe(401)
  })
})

describe('sameAddress', () => {
  it('ignores case and surrounding space', () => {
    expect(sameAddress({ email: ' Henaut@Example.fr' }, { email: 'henaut@example.fr ' })).toBe(true)
  })

  it('never pairs two members who have no address', () => {
    expect(sameAddress({ email: null }, { email: null })).toBe(false)
    expect(sameAddress({ email: '' }, { email: '  ' })).toBe(false)
  })
})
