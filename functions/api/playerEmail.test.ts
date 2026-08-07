import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'

// #315 — users.email is nullable but still UNIQUE, so "no address" has exactly
// one valid representation: NULL. An empty string would be accepted for the
// first member and then rejected as a duplicate for the second, and would count
// as an address for every lookup that only checks the column is set.
//
// The forms send '' rather than omitting the key, because PATCH only touches
// the columns it sees — omitting it would silently keep the old address. So the
// conversion has to happen here, at the write.

/** A database that records every statement and its bound parameters. */
function recordingDb() {
  const statements: { sql: string; params: unknown[] }[] = []
  const result = { first: async () => null, run: async () => ({ success: true }), all: async () => ({ results: [] }) }
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        statements.push({ sql, params })
        return result
      },
      ...result,
    }),
  } as unknown as D1Database
  return { db, statements }
}

/** The guard is covered by avatarRoutes.test.ts; here it is just in the way. */
const send = (db: D1Database, path: string, method: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

/** The parameter bound to `email` by the statement that wrote the users row. */
function boundEmail(statements: { sql: string; params: unknown[] }[]): unknown {
  const write = statements.filter((s) => /INSERT INTO users|UPDATE users/.test(s.sql)).pop()
  expect(write, 'no write to users was issued').toBeDefined()
  const { sql, params } = write!
  // INSERT lists the columns in a fixed order, email second.
  if (sql.includes('INSERT')) return params[1]
  // PATCH builds `SET a = ?, b = ?, …` in the order the keys were seen.
  const columns = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(' WHERE ')).split(', ')
  return params[columns.findIndex((c) => c.startsWith('email'))]
}

describe('player e-mail is stored as NULL when empty (#315)', () => {
  it('clears the column on PATCH with an empty string', async () => {
    const { db, statements } = recordingDb()
    const res = await send(db, '/players/p1', 'PATCH', { email: '' })
    expect(res.status).toBe(200)
    expect(boundEmail(statements)).toBeNull()
  })

  it('treats whitespace as no address', async () => {
    const { db, statements } = recordingDb()
    await send(db, '/players/p1', 'PATCH', { email: '   ' })
    expect(boundEmail(statements)).toBeNull()
  })

  it('keeps a real address, trimmed', async () => {
    const { db, statements } = recordingDb()
    await send(db, '/players/p1', 'PATCH', { email: ' gilles@example.fr ' })
    expect(boundEmail(statements)).toBe('gilles@example.fr')
  })

  it('creates a player with no address as NULL', async () => {
    const { db, statements } = recordingDb()
    const res = await send(db, '/players', 'POST', {
      id: 'p9', firstName: 'Enzo', lastName: 'Lotz', licenseNumber: '671234',
      email: '', phone: '', status: 'active', clubId: 'club-1',
    })
    expect(res.status).toBe(200)
    expect(boundEmail(statements)).toBeNull()
  })

  it('leaves the column alone when the key is absent', async () => {
    const { db, statements } = recordingDb()
    await send(db, '/players/p1', 'PATCH', { phone: '0600000000' })
    const write = statements.filter((s) => /UPDATE users/.test(s.sql)).pop()
    expect(write?.sql).toBeDefined()
    expect(write!.sql).not.toContain('email')
  })
})
