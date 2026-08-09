import { describe, expect, it } from 'vitest'
import { app } from './[[path]]'

// #319 — game_availabilities lost its own `id` in 0033 (#282) and is keyed on
// (game_id, player_id). The mobile client kept sending an invented `id` and
// reading it back off the record; the read was a type error, and the write was
// a field the route had already stopped looking at.
//
// These tests pin the contract the client now relies on: the pair alone
// identifies the row, on the write as well as on the clear. Nothing else covers
// this route — mobile still has no test harness (#148).

/** A database that records every statement and its bound parameters. */
function recordingDb() {
  const statements: { sql: string; params: unknown[] }[] = []
  const result = { first: async () => null, run: async () => ({ success: true }), all: async () => ({ results: [] }) }
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        statements.push({ sql, params })
        return result
      },
      ...result,
    }),
  } as unknown as D1Database
  return { db, statements }
}

/** The guard is covered by avatarRoutes.test.ts; here it is just in the way. */
const post = (db: D1Database, path: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

describe('game availabilities are keyed on (gameId, playerId) (#319)', () => {
  it('upserts from the pair alone, with no id in the payload', async () => {
    const { db, statements } = recordingDb()
    const res = await post(db, '/game-availabilities/set', {
      gameId: 'g1', playerId: 'p1', status: 'available',
    })
    expect(res.status).toBe(200)

    const write = statements.pop()!
    expect(write.sql).toContain('ON CONFLICT(game_id, player_id)')
    expect(write.params).toEqual(['g1', 'p1', 'available', null])
  })

  it('writes no id column, so a stray one changes nothing', async () => {
    const { db, statements } = recordingDb()
    await post(db, '/game-availabilities/set', {
      id: 'avail-1754000000000-x9k2p', gameId: 'g1', playerId: 'p1', status: 'maybe',
    })

    const write = statements.pop()!
    expect(write.sql).not.toMatch(/\bid\b(?!_)/)
    expect(write.params).toEqual(['g1', 'p1', 'maybe', null])
  })

  it('carries an override through', async () => {
    const { db, statements } = recordingDb()
    await post(db, '/game-availabilities/set', {
      gameId: 'g1', playerId: 'p1', status: 'unavailable', overriddenBy: 'captain',
    })
    expect(statements.pop()!.params).toEqual(['g1', 'p1', 'unavailable', 'captain'])
  })

  it('deletes on the pair too', async () => {
    const { db, statements } = recordingDb()
    const res = await post(db, '/game-availabilities/clear', { gameId: 'g1', playerId: 'p1' })
    expect(res.status).toBe(200)

    const del = statements.pop()!
    expect(del.sql).toContain('WHERE game_id = ? AND player_id = ?')
    expect(del.params).toEqual(['g1', 'p1'])
  })
})
