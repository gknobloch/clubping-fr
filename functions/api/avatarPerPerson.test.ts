// @vitest-environment node
//
// `node:sqlite`, every migration: a photo is read and written through the
// person, which only a real join can show.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'
import { sessionKey } from './auth'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #741 — one photo per person: Gilles at Rixheim and Gilles at Landser, and
// his general admin profile, show the same one, whichever he set it from.

function world() {
  const d1 = migratedD1()
  addMember(d1.exec, { id: 'g-rix', firstName: 'Gilles', lastName: 'K', email: 'g@example.fr', clubId: 'club-a', personId: 'person-g' })
  addMember(d1.exec, { id: 'g-lan', firstName: 'Gilles', lastName: 'K', email: null, clubId: 'club-b', personId: 'person-g' })
  addMember(d1.exec, { id: 'g-admin', firstName: 'Gilles', lastName: 'K', email: null, clubId: null, role: 'general_admin', personId: 'person-g' })
  addMember(d1.exec, { id: 'chloe', firstName: 'Chloé', lastName: 'B', email: 'c@example.fr', clubId: 'club-a' })
  const call = async (as: string | null, path: string, method = 'GET', body?: unknown) => {
    if (as) {
      d1.exec('INSERT OR IGNORE INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)',
        await sessionKey(`t-${as}`), as, Date.now() + 3_600_000)
    }
    return app.fetch(new Request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer t-${as}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB: d1.db })
  }
  const photos = () => d1.rows<{ user_id: string }>('SELECT user_id FROM user_avatars ORDER BY user_id').map((r) => r.user_id)
  return { ...d1, call, photos }
}

describe('a photo is the person’s (#741)', () => {
  it('set from Rixheim, shows on Landser and on the general admin profile', async () => {
    const w = world()
    expect((await w.call('g-rix', '/users/g-rix/avatar', 'PUT', { data: 'AAAA' })).status).toBe(200)
    for (const id of ['g-rix', 'g-lan', 'g-admin']) expect((await w.call(null, `/users/${id}/avatar`)).status).toBe(200)
    expect((await w.call(null, '/users/chloe/avatar')).status).toBe(404)

    const data = await (await w.call('g-rix', '/data')).json() as {
      users: Array<{ id: string; avatarUpdatedAt?: string }>
    }
    const stamp = (id: string) => data.users.find((u) => u.id === id)?.avatarUpdatedAt
    expect(stamp('g-lan')).toBe(stamp('g-rix'))
    // Not a player, still the person's photo — the header shows it.
    expect(stamp('g-admin')).toBe(stamp('g-rix'))
    expect(stamp('chloe')).toBeUndefined()
  })

  it('keeps one: set again from Landser, the Rixheim one goes', async () => {
    const w = world()
    await w.call('g-rix', '/users/g-rix/avatar', 'PUT', { data: 'AAAA' })
    expect((await w.call('g-lan', '/users/g-lan/avatar', 'PUT', { data: 'BBBB' })).status).toBe(200)
    expect(w.photos()).toEqual(['g-lan'])
  })

  it('may be changed from any of the person’s profiles, and removed for all of them', async () => {
    const w = world()
    await w.call('g-rix', '/users/g-rix/avatar', 'PUT', { data: 'AAAA' })
    // Signed in at Landser, Gilles removes the photo shown on his Rixheim profile.
    expect((await w.call('g-lan', '/users/g-rix/avatar', 'DELETE')).status).toBe(200)
    expect(w.photos()).toEqual([])
    // Somebody else's, never.
    expect((await w.call('chloe', '/users/g-rix/avatar', 'PUT', { data: 'CCCC' })).status).toBe(403)
  })

  it('merging two people keeps the kept person’s photo', async () => {
    const w = world()
    // A second Gilles, spelled otherwise, with a photo of his own.
    addMember(w.exec, { id: 'g-other', firstName: 'G.', lastName: 'K', email: null, clubId: 'club-c', personId: 'person-g2' })
    w.exec("UPDATE users SET role = 'general_admin' WHERE id = 'g-admin'")
    await w.call('g-rix', '/users/g-rix/avatar', 'PUT', { data: 'KEPT' })
    await w.call('g-other', '/users/g-other/avatar', 'PUT', { data: 'GONE' })
    const res = await w.call('g-admin', '/people/person-g2/merge-into', 'POST', { targetId: 'person-g' })
    expect(res.status).toBe(200)
    expect(w.photos()).toEqual(['g-rix'])
  })

  it('0077 keeps the most recent photo of a person who had several', () => {
    const w = world()
    w.exec(`INSERT INTO user_avatars (user_id, data, content_type, updated_at) VALUES
      ('g-rix', 'OLD', 'image/jpeg', '2026-01-01T00:00:00Z'),
      ('g-lan', 'NEW', 'image/jpeg', '2026-06-01T00:00:00Z'),
      ('chloe', 'HER', 'image/jpeg', '2026-01-01T00:00:00Z')`)
    const sql = readFileSync(join(__dirname, '../../migrations/0077_avatar_per_person.sql'), 'utf8')
      .split('\n').filter((l) => !l.startsWith('--')).join('\n')
    w.exec(sql)
    expect(w.photos()).toEqual(['chloe', 'g-lan'])
  })
})
