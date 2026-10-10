// @vitest-environment node
//
// Node, not happy-dom, which drops `Set-Cookie` as a forbidden header name —
// and a switch has to hand the web its new session as a cookie (#370). Node
// also gives `node:sqlite`: these run against the real, migrated schema.
import { describe, expect, it } from 'vitest'
import { authApp, hashOtp, sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #640 — one address, several profiles: a parent and a child sharing the
// parent's. #655 — one PERSON, several club profiles (Gilles at Rixheim and
// Landser), and delegation (Benjamin opens Sacha's, who has no address).
// Signing in opens the profile used last among everything the address
// reaches, the session names the rest, and switching to one is signing in
// again as it, without a second code — for those profiles and nobody else.

const CODE = '123456'

async function world(build: (exec: ReturnType<typeof migratedD1>['exec']) => void) {
  const d1 = migratedD1()
  d1.exec(`INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
    ('club-a', '06680011', 'PPA Rixheim', 0), ('club-b', '06670001', 'CSS Bergheim', 0)`)
  build(d1.exec)
  for (const email of ['henaut@example.fr', 'gilles@example.fr', 'sacha@example.fr']) {
    d1.exec('INSERT INTO auth_otp (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)',
      email, await hashOtp(email, CODE), Date.now() + 60_000)
  }
  const sessions = () => new Map(
    d1.rows<{ token: string; user_id: string }>('SELECT token, user_id FROM sessions').map((r) => [r.token, r.user_id]),
  )
  return { ...d1, sessions }
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
  user: { id: string; personId?: string }
  profiles: Array<{ id: string; firstName?: string; clubName?: string }>
}

async function signIn(db: D1Database, email = 'henaut@example.fr'): Promise<SessionBody> {
  const res = await post(db, 'email/verify', { email, code: CODE })
  expect(res.status).toBe(200)
  return res.json()
}

/** Benjamin and Sacha sharing Benjamin's address — #640's household. */
const household = (exec: ReturnType<typeof migratedD1>['exec'], sachaSeen = 1_000) => {
  addMember(exec, { id: 'benjamin', firstName: 'Benjamin', email: 'Henaut@example.fr', clubId: 'club-a', lastSeenAt: 2_000 })
  addMember(exec, { id: 'sacha', firstName: 'Sacha', email: 'henaut@example.fr', clubId: 'club-b', lastSeenAt: sachaSeen })
  addMember(exec, { id: 'stranger', firstName: 'Zoé', lastName: 'Roy', email: 'zoe@example.fr', clubId: 'club-a' })
}

describe('signing in with an address several profiles share (#640)', () => {
  it('opens the profile used most recently', async () => {
    const { db } = await world((exec) => household(exec))
    expect((await signIn(db)).user.id).toBe('benjamin')
  })

  it('opens the child’s when the phone was last the child’s', async () => {
    const { db } = await world((exec) => household(exec, 3_000))
    expect((await signIn(db)).user.id).toBe('sacha')
  })

  it('names every profile of the address, signed-in one first, clubs named', async () => {
    const { db } = await world((exec) => household(exec))
    const body = await signIn(db)
    expect(body.profiles.map((p) => p.id)).toEqual(['benjamin', 'sacha'])
    expect(body.profiles[1]).toMatchObject({ firstName: 'Sacha', clubName: 'CSS Bergheim' })
  })

  it('answers /me with the profiles too — a restored session never saw the sign-in', async () => {
    const { db } = await world((exec) => household(exec))
    const { token } = await signIn(db)
    const res = await authApp.fetch(
      new Request('http://localhost/me', { headers: { Authorization: `Bearer ${token}` } }),
      { DB: db },
    )
    const body = (await res.json()) as SessionBody
    expect(body.profiles.map((p) => p.id)).toEqual(['benjamin', 'sacha'])
    expect(body.user.personId).toBe('person-benjamin')
  })
})

describe('switching profile', () => {
  it('becomes the other profile, in a fresh session, and revokes the old one', async () => {
    const { db, sessions } = await world((exec) => household(exec))
    const { token } = await signIn(db)
    const res = await post(db, 'switch', { userId: 'sacha' }, token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as SessionBody
    expect(body.user.id).toBe('sacha')
    expect(body.token).not.toBe(token)
    expect(res.headers.get('Set-Cookie')).toContain(`cp_session=${body.token}`)
    // One session on the device, and it is Sacha's.
    expect(sessions().has(await sessionKey(token))).toBe(false)
    expect(sessions().get(await sessionKey(body.token))).toBe('sacha')
  })

  it('refuses a member out of reach, and leaves the session alone', async () => {
    const { db, sessions } = await world((exec) => household(exec))
    const { token } = await signIn(db)
    const res = await post(db, 'switch', { userId: 'stranger' }, token)
    expect(res.status).toBe(403)
    expect(sessions().get(await sessionKey(token))).toBe('benjamin')
  })

  it('refuses an unknown id exactly as it refuses a stranger', async () => {
    const { db } = await world((exec) => household(exec))
    const { token } = await signIn(db)
    const res = await post(db, 'switch', { userId: 'nobody' }, token)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed' })
  })

  it('reads the address now — a child given their own is out of reach', async () => {
    const { db, exec } = await world((build) => household(build))
    const { token } = await signIn(db)
    exec("UPDATE people SET email = 'sacha@example.fr' WHERE id = (SELECT person_id FROM users WHERE id = 'sacha')")
    expect((await post(db, 'switch', { userId: 'sacha' }, token)).status).toBe(403)
  })

  it('needs a session', async () => {
    const { db } = await world((exec) => household(exec))
    expect((await post(db, 'switch', { userId: 'sacha' })).status).toBe(401)
  })
})

describe('one person, several clubs (#655)', () => {
  const gilles = (exec: ReturnType<typeof migratedD1>['exec']) => {
    addMember(exec, { id: 'gilles-rix', firstName: 'Gilles', lastName: 'Knobloch', email: 'gilles@example.fr', clubId: 'club-a', personId: 'person-g', lastSeenAt: 5 })
    addMember(exec, { id: 'gilles-lan', firstName: 'Gilles', lastName: 'Knobloch', email: 'gilles@example.fr', clubId: 'club-b', personId: 'person-g' })
  }

  it('offers the person’s profile in every club, and switches between them', async () => {
    const { db } = await world(gilles)
    const body = await signIn(db, 'gilles@example.fr')
    expect(body.user.id).toBe('gilles-rix')
    expect(body.profiles.map((p) => p.clubName)).toEqual(['PPA Rixheim', 'CSS Bergheim'])
    expect((await post(db, 'switch', { userId: 'gilles-lan' }, body.token)).status).toBe(200)
  })

  // The person is the link, not the address: changing it on one profile
  // leaves the other in reach — which an address-only rule could not.
  it('keeps both in reach whatever the address of either says', async () => {
    const { db, exec } = await world(gilles)
    const { token } = await signIn(db, 'gilles@example.fr')
    exec("UPDATE users SET email = 'g.k@example.fr' WHERE id = 'gilles-lan'")
    expect((await post(db, 'switch', { userId: 'gilles-lan' }, token)).status).toBe(200)
  })
})

describe('delegation (#655)', () => {
  // Sacha has an address of his own now, and Benjamin manages him.
  const delegated = (exec: ReturnType<typeof migratedD1>['exec']) => {
    addMember(exec, { id: 'benjamin', firstName: 'Benjamin', email: 'henaut@example.fr', clubId: 'club-a', lastSeenAt: 2_000 })
    addMember(exec, { id: 'sacha', firstName: 'Sacha', email: 'sacha@example.fr', clubId: 'club-b', lastSeenAt: 1_000 })
    exec("INSERT INTO person_delegates (person_id, delegate_id) VALUES ('person-sacha', 'person-benjamin')")
  }

  it("lets the delegate open the person's profiles, from his own address", async () => {
    const { db } = await world(delegated)
    const body = await signIn(db)
    expect(body.profiles.map((p) => p.id)).toEqual(['benjamin', 'sacha'])
    expect((await post(db, 'switch', { userId: 'sacha' }, body.token)).status).toBe(200)
  })

  it('does not let the person open the delegate’s — it goes one way', async () => {
    const { db } = await world(delegated)
    const body = await signIn(db, 'sacha@example.fr')
    expect(body.profiles.map((p) => p.id)).toEqual(['sacha'])
    expect((await post(db, 'switch', { userId: 'benjamin' }, body.token)).status).toBe(403)
  })

  it('takes effect at once when withdrawn', async () => {
    const { db, exec } = await world(delegated)
    const { token } = await signIn(db)
    exec('DELETE FROM person_delegates')
    expect((await post(db, 'switch', { userId: 'sacha' }, token)).status).toBe(403)
  })
})
