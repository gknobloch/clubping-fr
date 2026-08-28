import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { MAX_CLUB_ADMINS } from '../../src/lib/clubAdmins'

// #474 — the cap of 5 and the never-zero rule are decided here, not in the
// browser: the club screens disable their buttons from the same module, but a
// second tab, a stale page or a direct call all arrive at these routes. The
// rules themselves are pinned down in src/lib/clubAdmins.spec.ts; what these
// tests check is that the routes ask them, and write what they promise.

const CLUB = 'club-fftt-06680011'
const OTHER = 'club-fftt-06680105'

interface Row {
  id: string
  role: string
  club_id: string | null
  status: string
  email?: string | null
}

/**
 * A database answering the four queries these routes issue, and recording the
 * writes. Enough to be honest about what reaches the table without standing up
 * D1 in a unit test.
 */
function fakeDb(users: Row[]) {
  const writes: { sql: string; params: unknown[] }[] = []
  const run = async (sql: string, params: unknown[]) => {
    writes.push({ sql, params })
    return { success: true }
  }
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: async () => {
          if (/FROM clubs/.test(sql)) return params[0] === CLUB || params[0] === OTHER ? { id: params[0] } : null
          if (/lower\(email\)/.test(sql)) {
            const email = String(params[0]).toLowerCase()
            return users.find((u) => (u.email ?? '').toLowerCase() === email) ?? null
          }
          return null
        },
        run: () => run(sql, params),
        all: async () => ({ results: [] }),
      }),
      first: async () => null,
      run: async () => ({ success: true }),
      all: async () => ({ results: users }),
    }),
  } as unknown as D1Database
  return { db, writes }
}

/** The guard is covered elsewhere; here the escape hatch stands in for a general admin. */
const send = (db: D1Database, path: string, method: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

/** The API's error body. `res.json()` is `unknown` under the functions tsconfig. */
const errorOf = async (res: Response) =>
  (await res.json()) as { error?: string; message?: string }

const admin = (id: string, club = CLUB): Row => ({ id, role: 'club_admin', club_id: club, status: 'active' })
const player = (id: string, club = CLUB): Row => ({ id, role: 'player', club_id: club, status: 'active' })

describe('POST /clubs/:clubId/admins — promoting a member (#474)', () => {
  it('promotes a player of the club and binds them to it', async () => {
    const { db, writes } = fakeDb([admin('a0'), player('p1')])
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'p1' })
    expect(res.status).toBe(200)
    const write = writes.find((w) => /UPDATE users/.test(w.sql))
    expect(write?.sql).toContain("role = 'club_admin'")
    expect(write?.params).toEqual([CLUB, 'p1'])
  })

  // The promotion must not touch is_player: a player who becomes an admin is
  // still on the roster, still answers availabilities, still has a licence.
  it('leaves is_player alone, so a promoted player keeps playing', async () => {
    const { db, writes } = fakeDb([admin('a0'), player('p1')])
    await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'p1' })
    expect(writes.find((w) => /UPDATE users/.test(w.sql))?.sql).not.toContain('is_player')
  })

  it(`refuses the ${MAX_CLUB_ADMINS + 1}th admin`, async () => {
    const full = Array.from({ length: MAX_CLUB_ADMINS }, (_, i) => admin(`a${i}`))
    const { db, writes } = fakeDb([...full, player('p1')])
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'p1' })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).error).toBe('full')
    expect(writes).toEqual([])
  })

  it('still admits the fifth', async () => {
    const four = Array.from({ length: MAX_CLUB_ADMINS - 1 }, (_, i) => admin(`a${i}`))
    const { db } = fakeDb([...four, player('p1')])
    expect((await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'p1' })).status).toBe(200)
  })

  it("refuses a member of another club rather than moving them", async () => {
    const { db, writes } = fakeDb([admin('a0'), player('x', OTHER)])
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'x' })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).error).toBe('other_club')
    expect(writes).toEqual([])
  })

  it('refuses someone who already administers the club', async () => {
    const { db } = fakeDb([admin('a0')])
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'a0' })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).error).toBe('already_admin')
  })

  it('404s on an unknown club and on an unknown member', async () => {
    const { db } = fakeDb([admin('a0')])
    expect((await send(db, '/clubs/nope/admins', 'POST', { userId: 'a0' })).status).toBe(404)
    expect((await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'ghost' })).status).toBe(404)
  })

  it('answers with the French message, so the client need not build one', async () => {
    const full = Array.from({ length: MAX_CLUB_ADMINS }, (_, i) => admin(`a${i}`))
    const { db } = fakeDb([...full, player('p1')])
    const body = await errorOf(await send(db, `/clubs/${CLUB}/admins`, 'POST', { userId: 'p1' }))
    expect(body.message).toContain(String(MAX_CLUB_ADMINS))
  })
})

describe('POST /clubs/:clubId/admins — inviting a non-licensee (#474)', () => {
  it('creates a member who does not play, already bound to the club', async () => {
    const { db, writes } = fakeDb([admin('a0')])
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', {
      firstName: 'Virginie', lastName: 'Barlinge', email: 'v@example.com', phone: '0686839957',
    })
    expect(res.status).toBe(200)
    const insert = writes.find((w) => /INSERT INTO users/.test(w.sql))
    expect(insert?.sql).toContain("'club_admin', 0")
    expect(insert?.params).toEqual([
      expect.any(String), 'v@example.com', 'Virginie', 'Barlinge', '0686839957', CLUB,
    ])
  })

  it('refuses an address another member already signs in with', async () => {
    const { db, writes } = fakeDb([{ ...admin('a0'), email: 'Taken@example.com' }])
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', {
      firstName: 'Q', lastName: 'Colle', email: 'taken@example.com',
    })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).error).toBe('email_taken')
    expect(writes).toEqual([])
  })

  it('demands a name and an address — the address is the way in', async () => {
    const { db } = fakeDb([admin('a0')])
    for (const body of [
      { firstName: 'Q', lastName: 'Colle' },
      { firstName: 'Q', email: 'q@example.com' },
      { firstName: 'Q', lastName: 'Colle', email: '  ' },
    ]) {
      expect((await send(db, `/clubs/${CLUB}/admins`, 'POST', body)).status).toBe(400)
    }
  })

  // The cap is a property of the club, not of the path taken to reach it.
  it('refuses the invitation once the club is full', async () => {
    const full = Array.from({ length: MAX_CLUB_ADMINS }, (_, i) => admin(`a${i}`))
    const { db, writes } = fakeDb(full)
    const res = await send(db, `/clubs/${CLUB}/admins`, 'POST', {
      firstName: 'Q', lastName: 'Colle', email: 'q@example.com',
    })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).error).toBe('full')
    expect(writes).toEqual([])
  })
})

describe('DELETE /clubs/:clubId/admins/:userId (#474)', () => {
  it('stands an admin down to a plain member', async () => {
    const { db, writes } = fakeDb([admin('a0'), admin('a1')])
    const res = await send(db, `/clubs/${CLUB}/admins/a1`, 'DELETE')
    expect(res.status).toBe(200)
    const write = writes.find((w) => /UPDATE users/.test(w.sql))
    expect(write?.sql).toContain("role = 'player'")
    expect(write?.params).toEqual(['a1'])
  })

  // Everything but the role survives: the club, the licence, the roster place.
  it('touches neither club_id, is_player nor status', async () => {
    const { db, writes } = fakeDb([admin('a0'), admin('a1')])
    await send(db, `/clubs/${CLUB}/admins/a1`, 'DELETE')
    const sql = writes.find((w) => /UPDATE users/.test(w.sql))?.sql ?? ''
    expect(sql).not.toContain('club_id')
    expect(sql).not.toContain('is_player')
    expect(sql).not.toContain('status')
  })

  it('refuses the last admin, which would leave the club unadministered', async () => {
    const { db, writes } = fakeDb([admin('a0'), player('p1')])
    const res = await send(db, `/clubs/${CLUB}/admins/a0`, 'DELETE')
    expect(res.status).toBe(409)
    expect((await errorOf(res)).error).toBe('last_admin')
    expect(writes).toEqual([])
  })

  it('404s on someone who does not administer this club', async () => {
    const { db } = fakeDb([admin('a0'), admin('a1'), admin('elsewhere', OTHER)])
    expect((await send(db, `/clubs/${CLUB}/admins/elsewhere`, 'DELETE')).status).toBe(404)
    expect((await send(db, `/clubs/${CLUB}/admins/ghost`, 'DELETE')).status).toBe(404)
  })
})
