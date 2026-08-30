import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { app } from './[[path]]'
import { MAX_CLUB_ADMINS } from '../../src/lib/clubAdmins'

// No Resend key in the test env, so sendEmail logs rather than sends; the
// console is silenced and the log lines are what these tests read to check who
// would have been written to.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

/** Every address sendEmail would have written to, in order. */
const mailedTo = () =>
  vi.mocked(console.log).mock.calls
    .map((c) => /to=(\S+)/.exec(String(c[0]))?.[1])
    .filter((v): v is string => Boolean(v))

/** The body of the nth message that would have gone out. */
const mailBody = (n = 0) => String(vi.mocked(console.log).mock.calls[n]?.[0] ?? '')

// #474 — the door into the app for a club it has never heard of. The POST is
// public, so everything it accepts is untrusted; these tests are mostly about
// what it refuses and what it declines to reveal.

const AFFILIATION = '06680011'
const CLUB = `club-fftt-${AFFILIATION}`

interface UserRowish {
  id: string
  role: string
  club_id: string | null
  status: string
  email?: string | null
  license_number?: string
}

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
      if (/club_token_hash = \?/.test(sql)) {
        return requests.find((r) => r.club_token_hash === params[0] && r.status === 'pending_club') ?? null
      }
      if (/status IN/.test(sql)) {
        const email = String(params[0]).toLowerCase()
        return requests.find(
          (r) =>
            String(r.email).toLowerCase() === email &&
            r.affiliation_number === params[1] &&
            (r.status === 'pending_club' || r.status === 'pending_admin'),
        ) ?? null
      }
      return requests.find((r) => r.id === params[0]) ?? null
    }
    if (/FROM users/.test(sql)) {
      if (/license_number = \?/.test(sql)) {
        return users.find((u) => (u.license_number ?? '') === params[0] && params[0] !== '') ?? null
      }
      if (/role = 'general_admin'/.test(sql)) return null
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
      all: async () => ({
        results: /FROM club_admin_requests/.test(sql)
          ? requests
          : /role = 'general_admin'/.test(sql)
            ? users.filter((u) => u.role === 'general_admin' && u.email)
            : users,
      }),
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
  (await res.json()) as {
    error?: string
    message?: string
    ok?: boolean
    createdClub?: boolean
    clubId?: string
    clubNotified?: boolean
  }

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
      requests: [{ id: 'r1', email: 'Quentin.Colle@example.fr', affiliation_number: AFFILIATION, status: 'pending_club' }],
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
  // The answer reaches anyone who can type an affiliation number, so it carries
  // only what the requester just submitted themselves: whether their club is
  // being asked. Nothing about the queue, the club's state, or who else asked.
  it('says nothing beyond whether the club was written to', async () => {
    const { db } = fakeDb({ clubs: [CLUB] })
    const res = await send(db, '/onboarding/requests', 'POST', validForm)
    expect(await bodyOf(res)).toEqual({ ok: true, clubNotified: true })
  })
})

describe('PATCH /onboarding/requests/:id — deciding (#474)', () => {
  const pending = {
    id: 'r1', affiliation_number: AFFILIATION, club_id: null, email: 'quentin.colle@example.fr',
    first_name: 'Quentin', last_name: 'Colle', phone: '0672124915', message: '',
    fftt_snapshot: JSON.stringify(validForm.snapshot), status: 'pending_admin',
    license_number: '', correspondent_email: 'pparixheim@gmail.com',
    club_token_hash: null, club_token_expires_at: null, club_confirmed_at: 2,
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
    // No licence was given, so they are created as someone who does not play:
    // is_player is the 3rd bound value of that INSERT.
    const user = writes.find((w) => /INSERT INTO users/.test(w.sql))!
    expect(user.sql).toContain("'club_admin'")
    expect(user.params[2]).toBe(0)
  })

  // The point of asking for a licence: created as a non-player, a licensee is
  // invisible to the FFTT player import, which then inserts them a second time.
  it('creates a licensee as a player, carrying their licence', async () => {
    const { db, writes } = fakeDb({ requests: [{ ...pending, license_number: '425881' }] })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', {
      status: 'approved',
      club: { displayName: 'Rixheim PPA' },
    })
    expect(res.status).toBe(200)
    const user = writes.find((w) => /INSERT INTO users/.test(w.sql))!
    expect(user.params[2]).toBe(1)
    expect(user.params).toContain('425881')
  })

  // A licence identifies a person better than an address does, so it is asked
  // first — the licensee writing in from a new address is exactly the case a
  // second row would otherwise be created for.
  it('finds an existing licensee by licence rather than creating one', async () => {
    const { db, writes } = fakeDb({
      clubs: [CLUB],
      requests: [{ ...pending, club_id: CLUB, license_number: '425881', email: 'nouvelle@example.fr' }],
      users: [{ id: 'p9', role: 'player', club_id: CLUB, status: 'active', email: 'ancienne@example.fr', license_number: '425881' }],
    })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'approved' })
    expect(res.status).toBe(200)
    expect(writes.some((w) => /INSERT INTO users/.test(w.sql))).toBe(false)
    expect(writes.find((w) => /UPDATE users/.test(w.sql))!.params).toContain('p9')
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
    expect(w.params[0]).toBe(CLUB)
    expect(w.params[w.params.length - 1]).toBe('p1')
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

describe('the club\u2019s confirmation step (#474)', () => {
  const live = {
    id: 'r1', affiliation_number: AFFILIATION, club_id: null, email: 'quentin.colle@example.fr',
    first_name: 'Quentin', last_name: 'Colle', phone: '0672124915', message: '',
    fftt_snapshot: JSON.stringify(validForm.snapshot), license_number: '',
    correspondent_email: 'pparixheim@gmail.com', club_token_expires_at: Date.now() + 60_000,
    club_confirmed_at: null, status: 'pending_club', created_at: 1,
    decided_at: null, decided_by: null, decision_note: null,
  }

  /** The SHA-256 of a token, as the table stores it. */
  const hash = async (token: string) => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const TOKEN = 'a'.repeat(64)

  it('writes to the address FFTT publishes, with a link that carries the token', async () => {
    const { db, writes } = fakeDb()
    await send(db, '/onboarding/requests', 'POST', validForm)
    expect(mailedTo()).toEqual(['pparixheim@gmail.com'])
    expect(mailBody()).toContain('/confirmer-demande?token=')
    // The row opens on the club step, and the token is stored hashed.
    const row = insert(writes)!
    expect(row.params).toContain('pending_club')
    expect(row.params.some((p) => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p))).toBe(true)
    // ...and never in the clear.
    expect(row.params).not.toContain(mailBody().match(/token=([0-9a-f]+)/)?.[1] ?? 'none')
  })

  // A club FFTT lists no address for must not be a club nobody can ever join.
  it('goes straight to the admins when FFTT publishes no address', async () => {
    const { db, writes } = fakeDb({
      users: [{ id: 'g1', role: 'general_admin', club_id: null, status: 'active', email: 'admin@example.fr' }],
    })
    const res = await send(db, '/onboarding/requests', 'POST', {
      ...validForm,
      snapshot: { ...validForm.snapshot, correspondentEmail: '' },
    })
    expect((await bodyOf(res)).clubNotified).toBe(false)
    expect(insert(writes)!.params).toContain('pending_admin')
    expect(mailedTo()).toEqual(['admin@example.fr'])
    expect(mailBody()).toContain('Aucun correspondant')
  })

  it('reads back only what the correspondent needs to recognise the person', async () => {
    const { db } = fakeDb({ requests: [{ ...live, club_token_hash: await hash(TOKEN) }] })
    const res = await send(db, `/onboarding/confirm?token=${TOKEN}`, 'GET')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toMatchObject({ firstName: 'Quentin', lastName: 'Colle', clubName: 'Rixheim PPA' })
    // Nothing about the queue, the decision, or anyone else.
    expect(Object.keys(body)).not.toContain('status')
    expect(Object.keys(body)).not.toContain('id')
  })

  it('confirms, hands over to the admins, and spends the token', async () => {
    const { db, writes } = fakeDb({
      requests: [{ ...live, club_token_hash: await hash(TOKEN) }],
      users: [{ id: 'g1', role: 'general_admin', club_id: null, status: 'active', email: 'admin@example.fr' }],
    })
    const res = await send(db, '/onboarding/confirm', 'POST', { token: TOKEN })
    expect(res.status).toBe(200)
    const w = writes.find((x) => /UPDATE club_admin_requests/.test(x.sql))!
    expect(w.sql).toContain("status = 'pending_admin'")
    // A confirmation link that still works once used is a link worth stealing.
    expect(w.sql).toContain('club_token_hash = NULL')
    expect(mailedTo()).toEqual(['admin@example.fr'])
    expect(mailBody()).toContain('pparixheim@gmail.com')
  })

  // Used, expired and never-existed are one answer: telling them apart tells a
  // guesser which of their guesses was close.
  it('answers the same way for a spent, expired or invented token', async () => {
    const spent = fakeDb({ requests: [{ ...live, club_token_hash: null }] })
    const expired = fakeDb({
      requests: [{ ...live, club_token_hash: await hash(TOKEN), club_token_expires_at: Date.now() - 1 }],
    })
    const unknown = fakeDb({ requests: [] })
    for (const { db } of [spent, expired, unknown]) {
      expect((await send(db, `/onboarding/confirm?token=${TOKEN}`, 'GET')).status).toBe(404)
      expect((await send(db, '/onboarding/confirm', 'POST', { token: TOKEN })).status).toBe(404)
    }
    expect(spent.writes).toEqual([])
    expect(expired.writes).toEqual([])
  })

  it('will not take a token that is not one', async () => {
    const { db } = fakeDb({ requests: [{ ...live, club_token_hash: await hash(TOKEN) }] })
    for (const bad of ['', 'short', "' OR 1=1 --", 'z'.repeat(64)]) {
      expect((await send(db, `/onboarding/confirm?token=${encodeURIComponent(bad)}`, 'GET')).status).toBe(404)
    }
  })

  // The queue is the general admin's; a request still with its club is not
  // theirs to decide yet, however the id was come by.
  it('refuses a decision on a request the club has not confirmed', async () => {
    const { db, writes } = fakeDb({ requests: [{ ...live, club_token_hash: await hash(TOKEN) }] })
    const res = await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'approved' })
    expect(res.status).toBe(409)
    expect((await bodyOf(res)).error).toBe('awaiting_club')
    expect(writes).toEqual([])
  })
})

describe('who hears the decision (#474)', () => {
  const confirmed = {
    id: 'r1', affiliation_number: AFFILIATION, club_id: CLUB, email: 'quentin.colle@example.fr',
    first_name: 'Quentin', last_name: 'Colle', phone: '', message: '',
    fftt_snapshot: JSON.stringify(validForm.snapshot), license_number: '',
    correspondent_email: 'pparixheim@gmail.com', club_token_hash: null,
    club_token_expires_at: null, club_confirmed_at: 2, status: 'pending_admin',
    created_at: 1, decided_at: null, decided_by: null, decision_note: null,
  }

  it('tells the requester and the club, on approval', async () => {
    const { db } = fakeDb({ clubs: [CLUB], requests: [confirmed] })
    await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'approved' })
    expect(mailedTo().sort()).toEqual(['pparixheim@gmail.com', 'quentin.colle@example.fr'])
  })

  it('tells them both on refusal too, with the motive', async () => {
    const { db } = fakeDb({ requests: [confirmed] })
    await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'rejected', note: 'Inconnue au club.' })
    expect(mailedTo().sort()).toEqual(['pparixheim@gmail.com', 'quentin.colle@example.fr'])
    expect(mailBody()).toContain('Inconnue au club.')
  })

  // On a small club the correspondent and the requester are often one person,
  // who should not receive the same message twice.
  it('writes once when the two addresses are the same', async () => {
    const { db } = fakeDb({
      clubs: [CLUB],
      requests: [{ ...confirmed, correspondent_email: 'Quentin.Colle@example.fr' }],
    })
    await send(db, '/onboarding/requests/r1', 'PATCH', { status: 'approved' })
    expect(mailedTo()).toEqual(['quentin.colle@example.fr'])
  })
})
