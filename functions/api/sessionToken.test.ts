// @vitest-environment node
//
// The suite default is happy-dom, whose Vite environment bundles imports and so
// refuses node built-ins outright. This file needs a real `node:sqlite`, and a
// worker-side test has no use for a DOM anyway.

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { authApp, userFromToken } from './auth'

// #410 — session tokens are stored as a digest, never as the value the client
// presents; #409 — signing in clears that member's expired rows, which nothing
// ever swept before.
//
// Both are claims about what is IN the table, not about which statements were
// issued, so these run against a real SQLite rather than a statement recorder:
// a DELETE that matches no row records perfectly and does nothing. `node:sqlite`
// belongs to the test environment only — the deployed worker has no node built-
// ins (see the note in tsconfig.functions.json), which is why the adapter below
// lives in a *.test.ts and not beside the code it exercises.

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

/**
 * The `sessions` / `users` columns these tests touch, per migrations 0006–0041.
 *
 * `token_hashed` is still here because production still has it: the code stops
 * reading it in this change, and a later one drops the column, so the table the
 * code will actually meet on deploy is this one. Nothing below sets it — the
 * INSERT no longer names it, which the DEFAULT covers.
 */
const SCHEMA = `
  CREATE TABLE sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    token_hashed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT, role TEXT NOT NULL DEFAULT 'player',
    is_player INTEGER NOT NULL DEFAULT 1, first_name TEXT, last_name TEXT,
    license_number TEXT, phone TEXT NOT NULL DEFAULT '', birth_date TEXT,
    birth_place TEXT, status TEXT NOT NULL DEFAULT 'active', club_id TEXT,
    first_login_at INTEGER, last_seen_at INTEGER
  );
  INSERT INTO users (id, email) VALUES ('u1', 'membre@example.invalid'),
                                       ('u2', 'autre@example.invalid');
`

/** A real SQLite wearing D1's interface — enough of it for the auth paths. */
function realD1() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(SCHEMA)
  const bound = (sql: string, params: unknown[]) => ({
    async first<T>() {
      return (sqlite.prepare(sql).get(...(params as never[])) ?? null) as T | null
    },
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...(params as never[])) as T[] }
    },
    async run() {
      sqlite.prepare(sql).run(...(params as never[]))
      return { success: true }
    },
  })
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => bound(sql, params),
      ...bound(sql, []),
    }),
  } as unknown as D1Database

  const sessions = () =>
    sqlite
      .prepare('SELECT token, user_id, expires_at FROM sessions ORDER BY expires_at')
      .all() as { token: string; user_id: string; expires_at: number }[]
  /**
   * A session row, keyed the way every row is keyed since #410 phase 1: by the
   * digest. Takes the token as the client holds it, so a test says what it
   * means and the hashing stays in one place.
   */
  const addSession = (token: string, userId: string, expiresAt: number) =>
    sqlite
      .prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at)' +
        ' VALUES (?,?,?,?)',
      )
      .run(sha256(token), userId, expiresAt - 1000, expiresAt)

  return { db, sessions, addSession }
}

const HOUR = 60 * 60 * 1000

/** Sign in through the dev-login route, which mints a session like any other. */
async function signIn(db: D1Database, userId = 'u1') {
  const res = await authApp.fetch(
    new Request('http://localhost/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }),
    { DB: db, DEV_LOGIN_ENABLED: 'true' },
  )
  expect(res.status).toBe(200)
  return (await res.json<{ token: string }>()).token
}

describe('session tokens are stored as a digest (#410)', () => {
  it('writes the hash, and hands the client the value it hashed', async () => {
    const { db, sessions } = realD1()
    const token = await signIn(db)

    const [row] = sessions()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(row.token).toBe(sha256(token))
    // The point of the exercise: what is in the table cannot be replayed.
    expect(row.token).not.toBe(token)
  })

  it('still authenticates the client that holds the plaintext', async () => {
    const { db } = realD1()
    const token = await signIn(db)

    expect(await userFromToken(db, token)).toMatchObject({ id: 'u1' })
  })

  // The regression this file exists to prevent, and the one case that outlives
  // the transition. A lookup that compares the presented value against the
  // stored one — `token = digest OR token = presented`, as the phase-1 fallback
  // was first written — passes every other test here and still fails this one:
  // replaying the stored value verbatim matches its own row, handing back
  // exactly the property the change removes. Nothing but the digest is ever
  // compared now, which is what closes it.
  it('refuses the stored digest presented as if it were a token', async () => {
    const { db, sessions } = realD1()
    await signIn(db)

    expect(await userFromToken(db, sessions()[0].token)).toBeNull()
  })

  /** Sign out with whatever token the client is holding. */
  const logout = (db: D1Database, token: string) =>
    authApp.fetch(
      new Request('http://localhost/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: db },
    )

  it('revokes a hashed session at logout', async () => {
    const { db, sessions } = realD1()
    const token = await signIn(db)
    expect(sessions()).toHaveLength(1)

    expect((await logout(db, token)).status).toBe(200)
    expect(sessions()).toHaveLength(0)
  })

  // The expiry sweep deletes by the key it matched. Deleting by the presented
  // value would match no row at all, leaving it to be re-checked forever.
  it('deletes an expired row rather than missing it', async () => {
    const { db, sessions, addSession } = realD1()
    const token = 'expired-token'
    addSession(token, 'u1', Date.now() - HOUR)

    expect(await userFromToken(db, token)).toBeNull()
    expect(sessions()).toHaveLength(0)
  })
})

describe('signing in clears that member’s expired sessions (#409)', () => {
  it('removes their dead rows', async () => {
    const { db, sessions, addSession } = realD1()
    addSession('dead-1', 'u1', Date.now() - HOUR)
    addSession('dead-2', 'u1', Date.now() - 90 * 24 * HOUR)

    await signIn(db, 'u1')
    expect(sessions().map((s) => s.token)).not.toContain(sha256('dead-1'))
    expect(sessions().map((s) => s.token)).not.toContain(sha256('dead-2'))
  })

  // The failure mode worth guarding: a purge scoped to the member but not to
  // expiry would sign them out of every other device on each new login.
  it('leaves their live sessions alone, so other devices stay signed in', async () => {
    const { db, sessions, addSession } = realD1()
    addSession('phone-still-valid', 'u1', Date.now() + 20 * 24 * HOUR)
    addSession('dead', 'u1', Date.now() - HOUR)

    const fresh = await signIn(db, 'u1')
    expect(sessions().map((s) => s.token).sort()).toEqual(
      [sha256('phone-still-valid'), sha256(fresh)].sort(),
    )
    expect(await userFromToken(db, 'phone-still-valid')).toMatchObject({ id: 'u1' })
  })

  it('never touches another member’s rows, expired or not', async () => {
    const { db, sessions, addSession } = realD1()
    addSession('someone-else-dead', 'u2', Date.now() - HOUR)

    await signIn(db, 'u1')
    expect(sessions().map((s) => s.token)).toContain(sha256('someone-else-dead'))
  })
})
