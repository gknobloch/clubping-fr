// @vitest-environment node
//
// `node:sqlite`, for a real join against the migrated schema.
import { describe, expect, it } from 'vitest'
import { householdIds, profileReaches } from './reach'
import { tokensByUser } from './notificationRoutes'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #655 — one relation decides what a profile reaches, and with it what the
// switcher offers, what /auth/switch admits and which devices ring. These pin
// the relation itself, and that a device rings for exactly it.

function family() {
  const d1 = migratedD1()
  // Gilles: one person, two clubs.
  addMember(d1.exec, { id: 'g-rix', firstName: 'Gilles', email: 'gilles@example.fr', personId: 'person-g' })
  addMember(d1.exec, { id: 'g-lan', firstName: 'Gilles', email: 'gilles@example.fr', personId: 'person-g' })
  // Benjamin manages Sacha, who has an address of his own.
  addMember(d1.exec, { id: 'benjamin', firstName: 'Benjamin', email: 'henaut@example.fr' })
  addMember(d1.exec, { id: 'sacha', firstName: 'Sacha', email: 'sacha@example.fr' })
  d1.exec("INSERT INTO person_delegates (person_id, delegate_id) VALUES ('person-sacha', 'person-benjamin')")
  // Two members with no address: nothing joins them.
  addMember(d1.exec, { id: 'paul-1', firstName: 'Paul', email: null })
  addMember(d1.exec, { id: 'paul-2', firstName: 'Paul', email: null })
  return d1
}

describe('profileReaches', () => {
  it("reaches the person's other clubs, both ways", async () => {
    const { db } = family()
    expect(await profileReaches(db, 'g-rix', 'g-lan')).toBe(true)
    expect(await profileReaches(db, 'g-lan', 'g-rix')).toBe(true)
  })

  it("reaches a delegator's profiles from the delegate, and not the reverse", async () => {
    const { db } = family()
    expect(await profileReaches(db, 'benjamin', 'sacha')).toBe(true)
    expect(await profileReaches(db, 'sacha', 'benjamin')).toBe(false)
  })

  it('never joins two members by an empty address', async () => {
    const { db } = family()
    expect(await profileReaches(db, 'paul-1', 'paul-2')).toBe(false)
  })

  it("keeps #640's shared address until it is cleaned up, case aside", async () => {
    const { db, exec } = family()
    addMember(exec, { id: 'leo', firstName: 'Léo', email: 'HENAUT@example.fr' })
    expect(await profileReaches(db, 'benjamin', 'leo')).toBe(true)
    expect(await profileReaches(db, 'leo', 'benjamin')).toBe(true)
  })
})

describe('householdIds', () => {
  it('holds who a profile reaches and who reaches it', async () => {
    const { db } = family()
    expect([...(await householdIds(db, 'sacha'))].sort()).toEqual(['benjamin', 'sacha'])
  })
})

describe('tokensByUser — a device rings for what its holder reaches', () => {
  it("rings Benjamin's phone for Sacha's matches, named, and Sacha's for his own only", async () => {
    const { db, exec } = family()
    exec("INSERT INTO push_tokens (token, user_id, platform, created_at, last_seen_at) VALUES ('phone-benjamin', 'benjamin', 'ios', 0, 0), ('phone-sacha', 'sacha', 'ios', 0, 0)")
    const devices = await tokensByUser(db, 'match', ['benjamin', 'sacha'])
    expect(devices.get('benjamin')?.map((d) => d.token)).toEqual(['phone-benjamin'])
    expect(devices.get('sacha')?.map((d) => d.token).sort()).toEqual(['phone-benjamin', 'phone-sacha'])
    // Benjamin's phone carries two profiles, so its messages say whose.
    expect(devices.get('sacha')?.find((d) => d.token === 'phone-benjamin')?.shared).toBe(true)
    expect(devices.get('sacha')?.find((d) => d.token === 'phone-sacha')?.shared).toBe(false)
  })
})
