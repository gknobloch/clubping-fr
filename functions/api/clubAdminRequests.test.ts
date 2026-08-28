import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { MAX_CLUB_ADMINS } from '../../src/lib/clubAdmins'

// #474 — the door into the app for a club it has never heard of. The POST is
// public, so everything it accepts is untrusted; these tests are mostly about
// what it refuses and what it declines to reveal.

const AFFILIATION = '06680011'
const CLUB = `club-fftt-${AFFILIATION}`

interface UserRowish { id: string; role: string; club_id: string | null; status: string; email?: string | null }

/**
 * A database over three tables: users, clubs, and the request queue. Answers
 * the queries these routes issue and records every write.
 */
function fakeDb(opts: {
  users?: UserRowish[]
  clubs?: string[]
  requests?: Record<string, unknown>[]
} = {}) {
  const users = opts.users ?? []
  const clubs = opts.clubs ?? []
  const requests = opts.requests ?? []
  const writes: { sql: string; params: unknown[] }[] = []

  const answer = (sql: string, params: unknown[]) => {
    if (/FROM clubs/.test(sql)) return clubs.includes(String(params[0])) ? { id: params[0] } : null
    if (/FROM club_admin_requests/.test(sql)) {
      if (/status = 'pending'/.test(sql)) {
        const email = String(params[0]).toLowerCase()
        return requests.find(
          (r) => String(r.email).toLowerCase() === email && r.affiliation_number === params[1] && r.status === 'pending',
        ) ?? null
      }
      return requests.find((r) => r.id === params[0]) ?? null
    }
    if (/FROM users/.test(sql)) {
      if (/role = 'club_admin' AND club_id/.test(sql)) {
        const email = String(params[0]).toLowerCase()
        return users.find(
          (u) => (u.email ?? '').toLowerCase() === email && u.role === 'club_admin' && u.club_id === params[1],
        ) ?? null
      }
      if (/lower\(email\)/.test(sql)) {
        const email = String(params[0]).toLowerCase()
        return users.find((u) => (u.email ?? '').toLowerCase() === email) ?? null
      }
    }
    return null
  }

  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: async () => answer(sql, params),
        run: async () => { writes.push({ sql, params }); return { success: true } },
        all: async () => ({ results: /FROM club_admin_requests/.test(sql) ? requests : users }),
      }),
      first: async () => null,
      run: async () => ({ success: true }),
      all: async () => ({ results: /FROM club_admin_requests/.test(sql) ? requests : users }),
    }),
  } as unknown as D1Database
  return { db, writes }
}

const send = (db: D1Database, path: string, method: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

const bodyOf = async (res: Response) =>
  (await res.json()) as { error?: string; message?: string; ok?: boolean; createdClub?: boolean; clubId?: string }

const validForm = {
  affiliationNumber: AFFILIATION,
  email: 'quentin.colle@example.fr',
  firstName: 'Quentin',
  lastName: 'Colle',
  phone: '0672124915',
  message: 'Je suis le correspondant du club.',
  snapshot: {
    displayName: 'Rixheim PPA',
    venue: 'Complexe Sportif · 5, rue Vaclav Havel, 68170 Rixheim',
    correspondentName: 'Quentin Colle',
    correspondentEmail: 'pparixheim@gmail.com',
    correspondentPhone: '0672124915',
  },
}

const insert = (writes: { sql: string; params: unknown[] }[]) =>
  writes.find((w) => /INSERT INTO club_admin_requests/.test(w.sql))

describe('POST /onboarding/requests — asking (#474)', () => {
  it('records a well-formed request', async () => {
    const { db, writes } = fakeDb()
    const res = await send(db, '/onboarding/requests', 'POST', validForm)
    expect(res.status).toBe(200)
    const row = insert(writes)
    expect(row).toBeDefined()
    expect(row!.params).toContain(AFFILIATION)
    expect(row!.params).toContain('quentin.colle@example.fr')
  })

  it('refuses a number that is not 8 digits, before touching the database', async () => {
    const { db, writes } = fakeDb()
    const res = await send(db, '/onboarding/requests', 'POST', { ...validForm, affiliationNumber: '123' })
    expect(res.status).toBe(400)
    expect((await bodyOf(res)).error).toBe('invalid_affiliation')
    expect(writes).toEqual([])
  })

  it('demands a name and a usable address', async () => {
    const { db } = fakeDb()
    const noName = await send(db, '/onboarding/requests', 'POST', { ...validForm, lastName: ' ' })
    expect((await bodyOf(noName)).error).toBe('missing_name')
    const noEmail = await send(db, '/onboarding/requests', 'POST', { ...validForm, email: 'nope' })
    expect((await bodyOf(noEmail)).error).toBe('invalid_email')
  })

  it('refuses a second pending request for the same club and address', async () => {
    const { db, writes } = fakeDb({
      requests: [{ id: 'r1', email: 'Quentin.Colle@example.fr', affiliation_number: AFFILIATION, status: 'pending' }],
    })
    const res = await send(db, '/onboarding/requests', 'POST', validForm)
    expect(res.status).toBe(409)
    expect((await bodyOf(res)).error).toBe('already_pending')
    expect(writes).toEqual([])
  })

  // A refused request is not a ban: the club may have sorted out whatever was
  // wrong, so asking again has to be possible.
  it('lets someone ask again after a refusal', async () => {
    const { db, writes } = fakeDb({
      requests: [{ id: 'r1', email: 'quentin.colle@example.fr', affiliation_number: AFFILIATION, status: 'rejected' }],
    })
    expect((await send(db, '/onboarding/requests', 'POST', validForm)).status).toBe(200)
    expect(insert(writes)).toBeDefined()
  })

  it('tells someone who already administers the club to just sign in', async () => {
    const { db } = fakeDb({
      clubs: [CLUB],
      users: [{ id: 'u1', role: 'club_admin', club_id: CLUB, status: 'active', email: 'quentin.colle@example.fr' }],
    })
    const res = await send(db, '/onboarding/requests', 'POST', validForm)
    expect(res.status).toBe(409)
    expect((await bodyOf(res)).error).toBe('already_admin')
  })

  it('links a club we already know, and leaves it null for one we do not', async () => {
    const known = fakeDb({ clubs: [CLUB] })
    await send(known.db, '/onboarding/requests', 'POST', validForm)
    expect(insert(known.writes)!.params[2]).toBe(CLUB)

    const unknown = fakeDb()
    await send(unknown.db, '/onboarding/requests', 'POST', validForm)
    expect(insert(unknown.writes)!.params[2]).toBeNull()
  })

  // The form is anonymous and public, so its free text is a hole to push
  // content through unless it is bounded at the write.
  it('clips the free text it is handed', async () => {
    const { db, writes } = fakeDb()
    await send(db, '/onboarding/requests', 'POST', {
      ...validForm,
      message: 'x'.repeat(5000),
      snapshot: { ...validForm.snapshot, displayName: 'y'.repeat(5000) },
    })
    const row = insert(writes)!
    expect((row.params[7] as string).length).toBe(500)
    expect(JSON.parse(row.params[8] as string).displayName.length).toBe(120)
  })

  // The response reaches anyone who can type an affiliation number, so it must
  // not become a way to ask whether a club or an address is known to the app.
  it('says nothing about the club or the queue on success', async () => {
    const { db } = fakeDb({ clubs: [CLUB] })
    const res = await send(db, '/onboarding/requests', 'POST', validForm)
    expect(await bodyOf(res)).toEqual({ ok: true })
  })
})

describe('PATCH /onboarding/requests/:id — deciding (#474)', () => {
  const pending = {
    id: 'r1', affiliation_number: AFFILIATION, club_id: null, email: 'quentin.colle@example.fr',
    first_name: 'Quentin', last_name: 'Colle', phone: '0672124915', message: '',
    fftt_snapshot: JSON.stringify(validForm.snapshot), status: 'pending',
    created_at: 1, decided_at: null, decided_by: null, decision_note: null,
  }

  it('refuses a request, keeping the row and the reason', async () => {
    const { db, writes } = fakeDb({ requests: [pending] })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'rejected', note: 'Déjà géré par Virginie.' })
    expect(res.status).toBe(200)
    const w = writes.find((x) => /UPDATE club_admin_requests/.test(x.sql))!
    expect(w.sql).toContain("status = 'rejected'")
    expect(w.params).toContain('Déjà géré par Virginie.')
    // Refusing writes nothing to users or clubs.
    expect(writes.some((x) => /INTO users|INTO clubs|UPDATE users/.test(x.sql))).toBe(false)
  })

  it('approving creates the missing club, its venue, and the admin', async () => {
    const { db, writes } = fakeDb({ requests: [pending] })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', {
      status: 'approved',
      club: { displayName: 'Rixheim PPA', venueLabel: 'Complexe Sportif', street: '5, rue Vaclav Havel', postalCode: '68170', city: 'Rixheim' },
    })
    expect(res.status).toBe(200)
    const body = await bodyOf(res)
    expect(body.createdClub).toBe(true)
    expect(body.clubId).toBe(CLUB)

    const club = writes.find((w) => /INSERT INTO clubs/.test(w.sql))!
    expect(club.params).toEqual([CLUB, AFFILIATION, 'Rixheim PPA'])
    expect(writes.find((w) => /INSERT INTO club_addresses/.test(w.sql))!.params).toContain('5, rue Vaclav Havel')
    // The requester is not a licensee, so they are created as a non-player.
    expect(writes.find((w) => /INSERT INTO users/.test(w.sql))!.sql).toContain("'club_admin', 0")
  })

  it('promotes the requester when they are already a member', async () => {
    const { db, writes } = fakeDb({
      clubs: [CLUB],
      requests: [{ ...pending, club_id: CLUB }],
      users: [{ id: 'p1', role: 'player', club_id: CLUB, status: 'active', email: 'quentin.colle@example.fr' }],
    })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'approved' })
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toMatchObject({ createdClub: false })
    const w = writes.find((x) => /UPDATE users/.test(x.sql))!
    expect(w.sql).toContain("role = 'club_admin'")
    expect(w.params).toEqual([CLUB, 'p1'])
    expect(writes.some((x) => /INSERT INTO users/.test(x.sql))).toBe(false)
  })

  // The cap belongs to the club, so it has to hold through this door too —
  // otherwise approving requests is a way to walk around it.
  it(`refuses to approve past ${MAX_CLUB_ADMINS} admins`, async () => {
    const full = Array.from({ length: MAX_CLUB_ADMINS }, (_, i) => ({
      id: `a${i}`, role: 'club_admin', club_id: CLUB, status: 'active', email: `a${i}@x.fr`,
    }))
    const { db, writes } = fakeDb({ clubs: [CLUB], requests: [{ ...pending, club_id: CLUB }], users: full })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'approved' })
    expect(res.status).toBe(409)
    expect((await bodyOf(res)).error).toBe('full')
    expect(writes.some((x) => /INSERT INTO users|UPDATE users/.test(x.sql))).toBe(false)
  })

  it('will not decide the same request twice', async () => {
    const { db, writes } = fakeDb({ requests: [{ ...pending, status: 'approved' }] })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'rejected' })
    expect(res.status).toBe(409)
    expect((await bodyOf(res)).error).toBe('already_decided')
    expect(writes).toEqual([])
  })

  it('rejects a decision that is neither approval nor refusal', async () => {
    const { db } = fakeDb({ requests: [pending] })
    expect((await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'maybe' })).status).toBe(400)
    expect((await send(db, '/onboarding/requests/r1', 'PATCH', {})).status).toBe(400)
  })

  it('404s on a request that does not exist', async () => {
    const { db } = fakeDb()
    expect((await send(db, '/onboarding/requests/nope', 'PATCH', { status: 'approved' })).status).toBe(404)
  })
})
