import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import type { MemberGroupMemberRow, MemberGroupRow, UserRow } from './rows'
import type { DataState } from '../../src/types'

// #602 — a club's own groups of members.
//
// Everything written here is one club's, so it follows `administers` (#558):
// a general admin anywhere, a club admin at home, nobody else. And everything
// is pinned to the club the URL names: another club's group or member is not
// found, rather than written through somebody else's URL.
//
// Reading is the other half: GET /api/data sends a club's groups to that club
// only.

const HOUR = 60 * 60 * 1000
const TOKEN = 'session-token'
const MINE = 'club-mine'
const THEIRS = 'club-theirs'

const member = (over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow => ({
  email: null, role: 'player', is_player: 1,
  first_name: 'A', last_name: 'B', license_number: '1', phone: '',
  birth_date: null, birth_place: null,
  status: 'active', club_id: MINE, first_login_at: null, last_seen_at: Date.now(),
  notifications_enabled: 1,
  ...over,
})

const generalAdmin = member({ id: 'ga', role: 'general_admin', club_id: null, is_player: 0 })
const myAdmin = member({ id: 'ca', role: 'club_admin' })
const theirAdmin = member({ id: 'ca2', role: 'club_admin', club_id: THEIRS })
const player = member({ id: 'p1' })
const teammate = member({ id: 'p2' })
const stranger = member({ id: 'p9', club_id: THEIRS })
const clubless = member({ id: 'p0', club_id: null })
const USERS = [generalAdmin, myAdmin, theirAdmin, player, teammate, stranger, clubless]

const GROUPS: MemberGroupRow[] = [
  { id: 'g-bureau', club_id: MINE, display_name: 'Bureau' },
  { id: 'g-jeunes', club_id: MINE, display_name: 'Jeunes' },
  { id: 'g-far', club_id: THEIRS, display_name: 'Arbitres' },
]
const MEMBERS: MemberGroupMemberRow[] = [
  { group_id: 'g-bureau', user_id: 'p1' },
  { group_id: 'g-jeunes', user_id: 'p1' },
  { group_id: 'g-jeunes', user_id: 'p2' },
  { group_id: 'g-far', user_id: 'p9' },
]

/** Enough D1 for the guard, the lookups these routes make, and GET /api/data. */
function fakeDb(viewerId: string | null) {
  const writes: { sql: string; params: unknown[] }[] = []
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
          if (sql.includes('FROM users WHERE id = ? AND club_id = ?')) {
            return USERS.find((u) => u.id === params[0] && u.club_id === params[1]) ?? null
          }
          if (sql.includes('FROM users WHERE id = ?')) {
            return USERS.find((u) => u.id === params[0]) ?? null
          }
          if (sql.includes('FROM member_groups WHERE id = ? AND club_id = ?')) {
            return GROUPS.find((g) => g.id === params[0] && g.club_id === params[1]) ?? null
          }
          return null
        },
        async all() {
          if (sql.includes('FROM member_groups WHERE club_id = ?')) {
            return { results: GROUPS.filter((g) => g.club_id === params[0]) }
          }
          if (sql.includes('SELECT id FROM users WHERE club_id = ?')) {
            return { results: USERS.filter((u) => u.club_id === params[0]).map((u) => ({ id: u.id })) }
          }
          return { results: [] }
        },
        async run() { writes.push({ sql, params }); return { success: true } },
      })
      return {
        bind: (...params: unknown[]) => ({ ...bound(params), __write: { sql, params } }),
        async first() { return null },
        async all() {
          if (sql === 'SELECT * FROM users') return { results: USERS }
          if (sql === 'SELECT * FROM member_groups') return { results: GROUPS }
          if (sql === 'SELECT * FROM member_group_members') return { results: MEMBERS }
          return { results: [] }
        },
        async run() { writes.push({ sql, params: [] }); return { success: true } },
      }
    },
    async batch(stmts: unknown[]) {
      for (const stmt of stmts) {
        const recorded = (stmt as { __write?: { sql: string; params: unknown[] } }).__write
        if (recorded) writes.push(recorded)
      }
      return stmts.map(() => ({ success: true }))
    },
  } as unknown as D1Database
  return { db, writes }
}

const request = (
  db: D1Database,
  method: string,
  path: string,
  body?: unknown,
  env: Record<string, unknown> = {},
) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { DB: db, ...env },
  )

/** Every write a route made — the guard's own last_seen_at refresh is not one. */
const wrote = (writes: { sql: string }[]) =>
  writes.filter((w) => !/UPDATE users SET last_seen_at/.test(w.sql))

/** The rows a replacement inserted, as (group, member) pairs. */
const inserted = (writes: { sql: string; params: unknown[] }[]) =>
  wrote(writes).filter((w) => w.sql.includes('INSERT')).map((w) => w.params)

const routes = [
  { name: 'POST /clubs/:clubId/member-groups', method: 'POST',
    path: (c: string) => `/clubs/${c}/member-groups`, body: { displayName: 'Loisirs' } },
  { name: 'PATCH …/member-groups/:groupId', method: 'PATCH',
    path: (c: string) => `/clubs/${c}/member-groups/${c === MINE ? 'g-bureau' : 'g-far'}`,
    body: { displayName: 'Comité' } },
  { name: 'DELETE …/member-groups/:groupId', method: 'DELETE',
    path: (c: string) => `/clubs/${c}/member-groups/${c === MINE ? 'g-bureau' : 'g-far'}`,
    body: undefined },
  { name: 'PUT …/member-groups/:groupId/members', method: 'PUT',
    path: (c: string) => `/clubs/${c}/member-groups/${c === MINE ? 'g-bureau' : 'g-far'}/members`,
    body: { memberIds: [] } },
  { name: 'PUT …/members/:userId/member-groups', method: 'PUT',
    path: (c: string) => `/clubs/${c}/members/${c === MINE ? 'p1' : 'p9'}/member-groups`,
    body: { groupIds: [] } },
] as const

for (const route of routes) {
  describe(route.name, () => {
    it('lets the club\'s own admin through', async () => {
      const { db, writes } = fakeDb('ca')
      expect((await request(db, route.method, route.path(MINE), route.body)).status).toBe(200)
      expect(wrote(writes).length).toBeGreaterThan(0)
    })

    it('refuses another club\'s admin, and writes nothing', async () => {
      const { db, writes } = fakeDb('ca2')
      const res = await request(db, route.method, route.path(MINE), route.body)
      expect(res.status).toBe(403)
      expect(wrote(writes)).toEqual([])
    })

    // The filter is everybody's; the groups are the admins'.
    it('refuses a plain member of the club itself', async () => {
      const { db, writes } = fakeDb('p1')
      expect((await request(db, route.method, route.path(MINE), route.body)).status).toBe(403)
      expect(wrote(writes)).toEqual([])
    })

    it('lets a general admin through, in any club', async () => {
      const { db } = fakeDb('ga')
      expect((await request(db, route.method, route.path(THEIRS), route.body)).status).toBe(200)
    })
  })
}

describe('naming a group', () => {
  it('stores the name tidied, under the club the URL names', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await request(db, 'POST', `/clubs/${MINE}/member-groups`, { id: 'g-new', displayName: '  Loisirs  du  jeudi ' })
    expect(await res.json()).toMatchObject({ group: { id: 'g-new', clubId: MINE, displayName: 'Loisirs du jeudi', memberIds: [] } })
    expect(inserted(writes)).toEqual([['g-new', MINE, 'Loisirs du jeudi']])
  })

  it('refuses a name the club already uses, whatever the case', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await request(db, 'POST', `/clubs/${MINE}/member-groups`, { displayName: 'bureau' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name_taken' })
    expect(wrote(writes)).toEqual([])
  })

  it('lets a club use a name another club already has', async () => {
    const { db } = fakeDb('ca')
    expect((await request(db, 'POST', `/clubs/${MINE}/member-groups`, { displayName: 'Arbitres' })).status).toBe(200)
  })

  it('refuses an empty name', async () => {
    const { db } = fakeDb('ca')
    expect((await request(db, 'POST', `/clubs/${MINE}/member-groups`, { displayName: '   ' })).status).toBe(400)
  })

  it('lets a rename keep the group\'s own name, and refuses a sibling\'s', async () => {
    const { db } = fakeDb('ca')
    expect((await request(db, 'PATCH', `/clubs/${MINE}/member-groups/g-bureau`, { displayName: 'BUREAU' })).status).toBe(200)
    expect((await request(db, 'PATCH', `/clubs/${MINE}/member-groups/g-bureau`, { displayName: 'Jeunes' })).status).toBe(409)
  })

  // An admin at home, naming another club's group through their own URL.
  it('does not find another club\'s group through this club\'s URL', async () => {
    const { db, writes } = fakeDb('ca')
    expect((await request(db, 'PATCH', `/clubs/${MINE}/member-groups/g-far`, { displayName: 'X' })).status).toBe(404)
    expect((await request(db, 'PUT', `/clubs/${MINE}/member-groups/g-far/members`, { memberIds: ['p1'] })).status).toBe(404)
    await request(db, 'DELETE', `/clubs/${MINE}/member-groups/g-far`)
    expect(wrote(writes)).toEqual([])
  })
})

describe('filing members', () => {
  it('replaces a group\'s members with the club\'s own members only', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await request(db, 'PUT', `/clubs/${MINE}/member-groups/g-bureau/members`, {
      memberIds: ['p1', 'p2', 'p9', 'p2', 'ghost'],
    })
    expect(await res.json()).toEqual({ ok: true, memberIds: ['p1', 'p2'] })
    const [first] = wrote(writes)
    expect(first.sql).toContain('DELETE FROM member_group_members WHERE group_id = ?')
    expect(inserted(writes)).toEqual([['g-bureau', 'p1'], ['g-bureau', 'p2']])
  })

  it('replaces a member\'s groups with this club\'s groups only', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await request(db, 'PUT', `/clubs/${MINE}/members/p2/member-groups`, {
      groupIds: ['g-bureau', 'g-far'],
    })
    expect(await res.json()).toEqual({ ok: true, groupIds: ['g-bureau'] })
    // Only the club's own groups are emptied of them.
    const [first] = wrote(writes)
    expect(first.sql).toMatch(/group_id IN \(SELECT id FROM member_groups WHERE club_id = \?\)/)
    expect(first.params).toEqual(['p2', MINE])
    expect(inserted(writes)).toEqual([['g-bureau', 'p2']])
  })

  it('does not find another club\'s member through this club\'s URL', async () => {
    const { db, writes } = fakeDb('ca')
    const res = await request(db, 'PUT', `/clubs/${MINE}/members/p9/member-groups`, { groupIds: ['g-bureau'] })
    expect(res.status).toBe(404)
    expect(wrote(writes)).toEqual([])
  })
})

describe('GET /api/data — who is sent which groups', () => {
  const groupsFor = async (viewerId: string | null, env: Record<string, unknown> = {}) => {
    const { db } = fakeDb(viewerId)
    const res = await request(db, 'GET', '/data', undefined, env)
    expect(res.status).toBe(200)
    return ((await res.json()) as DataState).memberGroups
  }

  it('sends a member their own club\'s groups, with who is in them', async () => {
    expect(await groupsFor('p2')).toEqual([
      { id: 'g-bureau', clubId: MINE, displayName: 'Bureau', memberIds: ['p1'] },
      { id: 'g-jeunes', clubId: MINE, displayName: 'Jeunes', memberIds: ['p1', 'p2'] },
    ])
  })

  it('sends a club admin nothing of another club', async () => {
    expect((await groupsFor('ca2')).map((g) => g.id)).toEqual(['g-far'])
  })

  it('sends a general admin every club\'s', async () => {
    expect((await groupsFor('ga')).map((g) => g.id)).toEqual(['g-bureau', 'g-jeunes', 'g-far'])
  })

  it('sends a member with no club none at all', async () => {
    expect(await groupsFor('p0')).toEqual([])
  })

  it('sends everything under the local escape hatch', async () => {
    expect(await groupsFor(null, { AUTH_GUARD_DISABLED: 'true' })).toHaveLength(3)
  })
})

describe('PATCH /players/:id — changing club', () => {
  it('takes the member out of every group but the new club\'s', async () => {
    const { db, writes } = fakeDb('ga')
    expect((await request(db, 'PATCH', '/players/p2', { clubId: THEIRS })).status).toBe(200)
    const cleanup = wrote(writes).find((w) => w.sql.includes('DELETE FROM member_group_members'))
    expect(cleanup?.sql).toMatch(/club_id IS NOT \?/)
    expect(cleanup?.params).toEqual(['p2', THEIRS])
  })

  it('leaves groups alone when the club is not in the patch', async () => {
    const { db, writes } = fakeDb('ca')
    await request(db, 'PATCH', '/players/p2', { phone: '0600000000' })
    expect(wrote(writes).some((w) => w.sql.includes('member_group_members'))).toBe(false)
  })
})
