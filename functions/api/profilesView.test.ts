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

// The person's fields, which `users` no longer carries since 0067.
const PERSON_FIELDS = ['birth_date', 'birth_place', 'email', 'first_name', 'last_name', 'phone']

describe('the profiles view (0066, 0067)', () => {
  it('is every column of users, plus the person — a column added to users must be added to the view', () => {
    const d1 = migratedD1()
    // email_pre_0060 is the emptied UNIQUE column 0060 left behind; nothing reads it.
    const expected = [...columns(d1, 'users').filter((c) => c !== 'email_pre_0060'), ...PERSON_FIELDS].sort()
    expect(columns(d1, 'profiles')).toEqual(expected)
  })

  it("has dropped the person's copies from users (0067)", () => {
    const d1 = migratedD1()
    expect(columns(d1, 'users').filter((c) => PERSON_FIELDS.includes(c))).toEqual([])
  })

  it("reads the person's fields from the person, on every profile of theirs", () => {
    const d1 = migratedD1()
    addMember(d1.exec, { id: 'g-rix', firstName: 'Gilles', email: 'g@example.fr', clubId: 'club-a', personId: 'person-g' })
    addMember(d1.exec, { id: 'g-lan', firstName: 'Gilles', email: 'g@example.fr', clubId: 'club-b', personId: 'person-g' })
    d1.exec("UPDATE people SET last_name = 'Knobloch', phone = '0611' WHERE id = 'person-g'")
    expect(d1.rows("SELECT id, last_name, phone FROM profiles WHERE person_id = 'person-g' ORDER BY id")).toEqual([
      { id: 'g-lan', last_name: 'Knobloch', phone: '0611' },
      { id: 'g-rix', last_name: 'Knobloch', phone: '0611' },
    ])
  })

  it("keeps a person's emptied address empty", () => {
    const d1 = migratedD1()
    addMember(d1.exec, { id: 'sacha', firstName: 'Sacha', email: 'henaut@example.fr', clubId: 'club-a' })
    d1.exec("UPDATE people SET email = NULL WHERE id = 'person-sacha'")
    expect(d1.rows("SELECT email FROM profiles WHERE id = 'sacha'")).toEqual([{ email: null }])
  })
})
