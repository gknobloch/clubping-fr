// @vitest-environment node
//
// `node:sqlite`, every migration in order: the view is schema, and what it
// answers is only true of the schema production will run.
import { describe, expect, it } from 'vitest'
import { addMember, migratedD1 } from './migratedD1.testkit'

// #655, step 4 — the API reads a club profile through `profiles` (0066): the
// row of `users`, with its person's fields taken from `people`.

const columns = (d1: ReturnType<typeof migratedD1>, table: string) =>
  d1.rows<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`).map((c) => c.name).sort()

describe('the profiles view (0066)', () => {
  it('has every column of users — a column added to users must be added to the view', () => {
    const d1 = migratedD1()
    // email_pre_0060 is the emptied UNIQUE column 0060 left behind; nothing reads it.
    expect(columns(d1, 'profiles')).toEqual(columns(d1, 'users').filter((c) => c !== 'email_pre_0060'))
  })

  it("reads the person's fields from the person, not from the profile's copy", () => {
    const d1 = migratedD1()
    addMember(d1.exec, { id: 'g-rix', firstName: 'Gilles', email: 'g@example.fr', clubId: 'club-a', personId: 'person-g' })
    addMember(d1.exec, { id: 'g-lan', firstName: 'Gilles', email: 'g@example.fr', clubId: 'club-b', personId: 'person-g' })
    d1.exec("UPDATE people SET last_name = 'Knobloch', phone = '0611' WHERE id = 'person-g'")
    expect(d1.rows("SELECT id, last_name, phone FROM profiles WHERE person_id = 'person-g' ORDER BY id")).toEqual([
      { id: 'g-lan', last_name: 'Knobloch', phone: '0611' },
      { id: 'g-rix', last_name: 'Knobloch', phone: '0611' },
    ])
  })

  it("keeps a person's emptied address empty, whatever the profile's copy still says", () => {
    const d1 = migratedD1()
    addMember(d1.exec, { id: 'sacha', firstName: 'Sacha', email: 'henaut@example.fr', clubId: 'club-a' })
    d1.exec("UPDATE people SET email = NULL WHERE id = 'person-sacha'")
    expect(d1.rows("SELECT email FROM profiles WHERE id = 'sacha'")).toEqual([{ email: null }])
  })

  it('shows a profile with no person through its own columns', () => {
    const d1 = migratedD1()
    d1.exec(
      `INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, status, club_id)
       VALUES ('orphan', 'o@example.fr', 'player', 1, 'Olga', 'Orphan', '', '0600', 'active', 'club-a')`,
    )
    expect(d1.rows("SELECT first_name, email, phone FROM profiles WHERE id = 'orphan'"))
      .toEqual([{ first_name: 'Olga', email: 'o@example.fr', phone: '0600' }])
  })
})
