import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { UserRow } from './rows'

// #613 — an opponent's hall, read from FFTT by the browser and written here.
//
// The imports create an opponent's club bare, so an away match had nowhere to
// show (#611). This route fills that blank and nothing else: a club with any
// address is refused, so nothing anyone wrote can be overwritten, and a club
// with its own administrator keeps its own address.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const MINE = 'club-mine'
const OPPONENT = 'club-opponent'
const FAR = 'club-far'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: MINE, first_login_at: null, last_seen_at: Date.now(),
  notifications_enabled: 1,
  notification_preferences: null,
  ...over,
})

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const myAdmin = member({ id: 'ca', role: 'club_admin' })
const farAdmin = member({ id: 'ca-far', role: 'club_admin', club_id: FAR })
const player = member({ id: 'p1' })

const TEAMS = [
  { club_id: MINE, group_id: 'g1' },
  { club_id: OPPONENT, group_id: 'g1' },
  { club_id: FAR, group_id: 'g2' },
]

interface World {
  users: UserRow[]
  viewerId: string | null
  clubs?: string[]
  /** Clubs that already hold an address. */
  addressed?: string[]
}

function fakeDb({ users, viewerId, clubs = [MINE, OPPONENT, FAR], addressed = [] }: World) {
  const inserts: unknown[][] = []
  const db = {
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async first() {
          if (sql.includes('FROM sessions')) {
            const key = await sessionKey(TOKEN)
            return viewerId && params.includes(key)
              ? { token: key, user_id: viewerId, expires_at: Date.now() + HOUR }
              : null
          }
          if (sql.includes('FROM users WHERE id = ?')) return users.find((u) => u.id === params[0]) ?? null
          if (sql.includes("role = 'club_admin' AND club_id = ?")) {
            return users.find((u) => u.role === 'club_admin' && u.club_id === params[0]) ?? null
          }
          if (sql.includes('FROM clubs WHERE id = ?')) return clubs.includes(params[0] as string) ? { id: params[0] } : null
          return null
        },
        async all() {
          if (sql.includes('JOIN teams other')) {
            const groups = TEAMS.filter((t) => t.club_id === params[0]).map((t) => t.group_id)
            return { results: TEAMS.filter((t) => groups.includes(t.group_id)).map((t) => ({ club_id: t.club_id })) }
          }
          return { results: [] }
        },
        async run() {
          if (sql.includes('INSERT INTO club_addresses')) {
            // The NOT EXISTS the statement carries.
            const clubId = params[1] as string
            if (addressed.includes(clubId)) return { success: true, meta: { changes: 0 } }
            inserts.push(params)
            addressed.push(clubId)
            return { success: true, meta: { changes: 1 } }
          }
          return { success: true, meta: { changes: 1 } }
        },
      })
      return { bind: (...params: unknown[]) => bound(params) }
    },
  } as unknown as D1Database
  return { db, inserts }
}

const hall = { label: 'Gymnase Jean Moulin', street: '3 rue du Stade', postalCode: '88000', city: 'Épinal' }

const post = (db: D1Database, clubId: string, body: unknown = hall, env: Record<string, unknown> = {}) =>
  app.fetch(
    new Request(`http://localhost/api/clubs/${clubId}/fftt-venue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    }),
    { DB: db, ...env },
  )

const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error

describe('POST /clubs/:clubId/fftt-venue (#613)', () => {
  it("lets an admin whose club shares a poule fill an opponent's blank", async () => {
    const { db, inserts } = fakeDb({ users: [myAdmin], viewerId: 'ca' })
    const res = await post(db, OPPONENT)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      address: { id: `addr-fftt-${OPPONENT}`, ...hall, isDefault: true },
    })
    expect(inserts).toHaveLength(1)
  })

  it('never overwrites: a club with an address is refused, and nothing is written', async () => {
    const { db, inserts } = fakeDb({ users: [myAdmin], viewerId: 'ca', addressed: [OPPONENT] })
    const res = await post(db, OPPONENT)

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('has_address')
    expect(inserts).toEqual([])
  })

  it('leaves a club with its own administrator to them', async () => {
    const opponentAdmin = member({ id: 'ca-opp', role: 'club_admin', club_id: OPPONENT })
    const { db, inserts } = fakeDb({ users: [myAdmin, opponentAdmin], viewerId: 'ca' })

    expect((await post(db, OPPONENT)).status).toBe(403)
    expect(inserts).toEqual([])
  })

  it('refuses an admin whose club plays elsewhere', async () => {
    const { db, inserts } = fakeDb({ users: [farAdmin], viewerId: 'ca-far' })

    expect((await post(db, OPPONENT)).status).toBe(403)
    expect(inserts).toEqual([])
  })

  it('refuses a plain member, even of a club in the poule', async () => {
    const { db, inserts } = fakeDb({ users: [player], viewerId: 'p1' })

    expect((await post(db, OPPONENT)).status).toBe(403)
    expect(inserts).toEqual([])
  })

  it('lets a general admin fill any blank, the backfill included', async () => {
    const { db } = fakeDb({ users: [generalAdmin], viewerId: 'ga' })

    expect((await post(db, FAR)).status).toBe(200)
  })

  it('names an unnamed hall « Salle », as the club import does', async () => {
    const { db } = fakeDb({ users: [generalAdmin], viewerId: 'ga' })
    const res = await post(db, FAR, { ...hall, label: '  ' })

    expect(((await res.json()) as { address: { label: string } }).address.label).toBe('Salle')
  })

  it('refuses a venue with no place in it', async () => {
    const { db, inserts } = fakeDb({ users: [generalAdmin], viewerId: 'ga' })
    const res = await post(db, FAR, { label: 'Gymnase', street: '', postalCode: '', city: ' ' })

    expect(res.status).toBe(400)
    expect(inserts).toEqual([])
  })

  it('answers 404 for a club that does not exist', async () => {
    const { db } = fakeDb({ users: [generalAdmin], viewerId: 'ga' })

    expect((await post(db, 'club-nowhere')).status).toBe(404)
  })

  it('admits the local escape hatch', async () => {
    const { db } = fakeDb({ users: [], viewerId: null })

    expect((await post(db, OPPONENT, hall, { AUTH_GUARD_DISABLED: 'true' })).status).toBe(200)
  })
})
