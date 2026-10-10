// A real SQLite, migrated like production, wearing D1's interface (#655).
//
// For the tests whose claim is about what the TABLES hold or join — who a
// profile reaches, which devices ring — rather than which statements were
// issued: a join written against the wrong column records perfectly in a
// statement fake and returns nothing in production. Every file of migrations/
// is applied in order, so the schema is the one the code will meet, not a
// hand-kept copy of it.
//
// Node only (`node:sqlite`): a test using this declares
// `// @vitest-environment node`, as sessionToken.test.ts does, and this file is
// kept out of the worker's type-check (tsconfig.functions.json).
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join(__dirname, '..', '..', 'migrations')

export function migratedD1() {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }
  sqlite.exec('PRAGMA foreign_keys = ON')
  const bound = (sql: string, params: unknown[]) => ({
    async first<T>() {
      return (sqlite.prepare(sql).get(...(params as never[])) ?? null) as T | null
    },
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...(params as never[])) as T[] }
    },
    async run() {
      sqlite.prepare(sql).run(...(params as never[]))
      return { success: true }
    },
    __run: () => sqlite.prepare(sql).run(...(params as never[])),
  })
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => bound(sql, params),
      ...bound(sql, []),
    }),
    // All or nothing, like D1's.
    async batch(stmts: Array<{ __run: () => unknown }>) {
      sqlite.exec('BEGIN')
      try {
        for (const s of stmts) s.__run()
        sqlite.exec('COMMIT')
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
      return stmts.map(() => ({ success: true }))
    },
  } as unknown as D1Database

  /** Raw SQL for a test's own fixtures and assertions. */
  const exec = (sql: string, ...params: unknown[]) => sqlite.prepare(sql).run(...(params as never[]))
  const rows = <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...(params as never[])) as T[]
  return { db, exec, rows }
}

/**
 * A club profile and its person, as 0063 and the API write them: the person
 * first, `person-<id>` unless the test names another.
 */
export function addMember(
  exec: (sql: string, ...params: unknown[]) => unknown,
  m: {
    id: string
    email?: string | null
    firstName: string
    lastName?: string
    clubId?: string | null
    role?: string
    lastSeenAt?: number | null
    personId?: string
  },
) {
  const personId = m.personId ?? `person-${m.id}`
  exec(
    `INSERT OR IGNORE INTO people (id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, '')`,
    personId, m.firstName, m.lastName ?? 'Henaut', m.email ?? null,
  )
  exec(
    `INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, status, club_id, last_seen_at, person_id)
     VALUES (?, ?, ?, 1, ?, ?, '', '', 'active', ?, ?, ?)`,
    m.id, m.email ?? null, m.role ?? 'player', m.firstName, m.lastName ?? 'Henaut', m.clubId ?? null, m.lastSeenAt ?? null, personId,
  )
}
