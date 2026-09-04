import { describe, expect, it, vi, afterEach } from 'vitest'
import { app } from './[[path]]'

// #482 — the divisions import asks FFTT for one contest and one only
// (`identifier: "1"`, see FFTT_CHAMPIONSHIP_CONTEST_IDENTIFIER), so it already
// knows which competition its divisions belong to; the modal has been printing
// that name since #219. These tests pin down that it files them itself, on the
// contest's identifier rather than its id, and that re-importing never moves a
// division a general admin has since filed elsewhere.

const CONTEST_NAME = 'FED_Championnat de France par Equipes Masculin'

interface DivisionRow {
  id: string
  phase_id: string
  display_name: string
  rank: number
  competition_id: string | null
}
interface CompetitionRow {
  id: string
  display_name: string
  fftt_contest_identifier: string | null
  fftt_contest_name: string | null
}

/**
 * FFTT answers with one contest and two divisions. `contestId` is what varies
 * between leagues and seasons — the point of the identifier test below.
 */
function mockFftt(contestId = '18368') {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const query = String(JSON.parse(String(init?.body ?? '{}')).query ?? '')
    const data = query.includes('contests(')
      ? {
        contests: {
          edges: [
            { node: { id: `/api/contests/${contestId}`, identifier: '1', name: CONTEST_NAME } },
            // Two contests sharing one identifier, as org 15 really lists them:
            // proof that a filtered query could not have said which was meant.
            { node: { id: '/api/contests/18647', identifier: 'TO', name: 'TOP DE ZONE 06' } },
            { node: { id: '/api/contests/18742', identifier: 'TO', name: 'TOP DE QUALIFICATION' } },
          ],
        },
      }
      : {
        divisions: {
          edges: [
            { node: { id: '/api/divisions/234322', identifier: 'GE1P1', name: 'GE 1 Phase 1', parent: null } },
            { node: { id: '/api/divisions/234612', identifier: 'GE7P1', name: 'GE 7 Phase 1', parent: null } },
          ],
        },
      }
    return new Response(JSON.stringify({ data }), { status: 200 })
  }))
}

/** A D1 standing in for the handful of tables this import touches. */
function fakeDb(divisions: DivisionRow[], competitions: CompetitionRow[]) {
  const run = async (sql: string, params: unknown[]) => {
    if (/INSERT INTO competitions/.test(sql)) {
      competitions.push({
        id: params[0] as string,
        display_name: params[1] as string,
        fftt_contest_identifier: params[3] as string | null,
        fftt_contest_name: params[4] as string | null,
      })
    }
    if (/INSERT INTO divisions/.test(sql)) {
      divisions.push({
        id: params[0] as string, phase_id: params[1] as string,
        display_name: params[2] as string, rank: params[3] as number,
        // is_archived is a literal 0 in the statement, not a placeholder, so
        // competition_id is the 8th bound value rather than the 9th column.
        competition_id: params[7] as string | null,
      })
    }
    if (/UPDATE competitions SET fftt_contest_name/.test(sql)) {
      const found = competitions.find((c) => c.id === params[1])
      if (found) found.fftt_contest_name = params[0] as string
    }
    if (/UPDATE divisions SET competition_id/.test(sql)) {
      const [competitionId, phaseId, id, loweredName] = params as string[]
      for (const d of divisions) {
        if (d.phase_id !== phaseId) continue
        if (d.id !== id && d.display_name.toLowerCase() !== loweredName) continue
        // The route's own `AND competition_id IS NULL` — the whole point.
        if (d.competition_id === null) d.competition_id = competitionId
      }
    }
    return { success: true }
  }
  const first = async (sql: string, params: unknown[]) => {
    if (/FROM seasons/.test(sql)) return { id: '27', display_name: '2026/2027' }
    if (/FROM phases/.test(sql)) return { id: 'phase-27-1', season_id: '27', name: 'Phase 1', display_name: '2026/2027 Phase 1', status: 'upcoming' }
    if (/FROM competitions WHERE fftt_contest_identifier/.test(sql)) {
      return competitions.find((c) => c.fftt_contest_identifier === params[0]) ?? null
    }
    if (/MAX\(sort_order\)/.test(sql)) return { next: competitions.length + 1 }
    return null
  }
  const statement = (sql: string, params: unknown[]) => ({
    first: () => first(sql, params),
    run: () => run(sql, params),
    all: async () => ({
      results: /FROM competitions WHERE fftt_contest_identifier = \?/.test(sql)
        ? competitions.filter((c) => c.fftt_contest_identifier === params[0])
        : /FROM divisions WHERE phase_id/.test(sql)
        ? divisions.map((d) => ({
          id: d.id, display_name: d.display_name, rank: d.rank, competition_id: d.competition_id,
        }))
        : [],
    }),
  })
  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => statement(sql, params),
      ...statement(sql, []),
    }),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      for (const s of stmts) await s.run()
      return stmts.map(() => ({ success: true }))
    },
  } as unknown as D1Database
}

const runImport = (
  db: D1Database, organizationId = 14, contestId?: string, divisionIds?: string[],
) =>
  app.fetch(
    new Request('http://localhost/api/divisions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, seasonId: 27, phase: 1, contestId, divisionIds }),
    }),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

/** The GraphQL queries the import issued, in order. */
const queriesOf = () =>
  (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((call) => String(JSON.parse(String((call[1] as RequestInit).body)).query))

const runPreview = (db: D1Database, contestId = '18368') =>
  app.fetch(
    new Request(`http://localhost/api/fftt/divisions-preview?organizationId=14&seasonId=27&phase=1&contestId=${contestId}`),
    { DB: db, AUTH_GUARD_DISABLED: 'true' },
  )

afterEach(() => vi.unstubAllGlobals())

describe('the divisions import files its divisions under a competition (#482)', () => {
  it('creates the competition from the FFTT contest, open to every category', async () => {
    mockFftt()
    const divisions: DivisionRow[] = []
    const competitions: CompetitionRow[] = []
    expect((await runImport(fakeDb(divisions, competitions))).status).toBe(200)

    expect(competitions).toHaveLength(1)
    expect(competitions[0]).toMatchObject({
      display_name: CONTEST_NAME,
      fftt_contest_identifier: '1',
    })
    // Every imported division lands filed under it.
    expect(divisions.map((d) => d.competition_id)).toEqual([competitions[0].id, competitions[0].id])
  })

  // The whole reason this keys on the identifier: FFTT issues a fresh contest
  // id per (organisation, season), so keying on the id would mint a new
  // competition every August and orphan the categories configured against it.
  it('reuses the same competition for another league, whose contest id differs', async () => {
    const divisions: DivisionRow[] = []
    const competitions: CompetitionRow[] = []
    const db = fakeDb(divisions, competitions)

    mockFftt('18368')
    await runImport(db, 14)
    const firstId = competitions[0].id

    // Another league: a different contest id, the same identifier.
    divisions.length = 0
    mockFftt('20991')
    await runImport(db, 72)

    expect(competitions).toHaveLength(1)
    expect(competitions[0].id).toBe(firstId)
  })

  it('files divisions imported before this existed, on a re-import', async () => {
    mockFftt()
    // Already present with nothing filed — the state migration 0045 leaves.
    const divisions: DivisionRow[] = [
      { id: '234322', phase_id: 'phase-27-1', display_name: 'GE 1', rank: 1, competition_id: null },
    ]
    const competitions: CompetitionRow[] = []
    await runImport(fakeDb(divisions, competitions))

    expect(divisions.find((d) => d.id === '234322')?.competition_id).toBe(competitions[0].id)
  })

  // Filling a blank is not the same as overruling a decision.
  it('never moves a division a general admin has already filed elsewhere', async () => {
    mockFftt()
    const divisions: DivisionRow[] = [
      { id: '234322', phase_id: 'phase-27-1', display_name: 'GE 1', rank: 1, competition_id: 'comp-jeunes' },
    ]
    const competitions: CompetitionRow[] = []
    await runImport(fakeDb(divisions, competitions))

    expect(divisions.find((d) => d.id === '234322')?.competition_id).toBe('comp-jeunes')
  })
})

describe('which championship the divisions import reads (#482)', () => {
  it('defaults to the men\'s team championship, as it always did', async () => {
    mockFftt()
    await runImport(fakeDb([], []))
    // The divisions query names the contest by id — resolved from the listing,
    // never asked for with an identifier filter that could match two contests.
    expect(queriesOf().some((q) => q.includes('contest_id: 18368'))).toBe(true)
  })

  it('reads the contest it is told to, by id', async () => {
    mockFftt()
    await runImport(fakeDb([], []), 14, '18742')
    expect(queriesOf().some((q) => q.includes('contest_id: 18742'))).toBe(true)
  })

  // No value from a request reaches a GraphQL string literal any more: the
  // contest is picked out of the listing in JavaScript.
  it('puts nothing from the request into a query literal', async () => {
    mockFftt()
    await runImport(fakeDb([], []), 14, '18742')
    for (const q of queriesOf()) expect(q).not.toMatch(/identifier:\s*"/)
  })

  it('finds nothing to import when the id names no contest', async () => {
    mockFftt()
    const res = await runImport(fakeDb([], []), 14, '99999')
    expect(res.status).toBe(404)
  })
})

// The case seen in production once #482 landed: every division of the phase was
// imported before competitions existed, so the preview had nothing to CREATE —
// and the dialog offered a disabled "Rien à importer", which made the filing
// unreachable. The preview has to say a re-import would still do something.
describe('an import that creates nothing can still file (#482)', () => {
  const unfiled = (): DivisionRow[] => [
    { id: '234322', phase_id: 'phase-27-1', display_name: 'GE 1', rank: 1, competition_id: null },
    { id: '234612', phase_id: 'phase-27-1', display_name: 'GE 7', rank: 2, competition_id: null },
  ]

  it('marks divisions that exist but are filed under nothing as attachable', async () => {
    mockFftt()
    const res = await runPreview(fakeDb(unfiled(), []))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { divisions: Array<{ exists: boolean; attachable: boolean }> }
    expect(body.divisions.every((d) => d.exists && d.attachable)).toBe(true)
  })

  it('does not mark one already filed', async () => {
    mockFftt()
    const rows = unfiled()
    rows[0].competition_id = 'comp-seniors'
    const body = (await (await runPreview(fakeDb(rows, []))).json()) as {
      divisions: Array<{ name: string; attachable: boolean }>
    }
    expect(body.divisions.find((d) => d.name === 'GE 1')?.attachable).toBe(false)
    expect(body.divisions.find((d) => d.name === 'GE 7')?.attachable).toBe(true)
  })

  it('and running it does file them, creating no division at all', async () => {
    mockFftt()
    const divisions = unfiled()
    const competitions: CompetitionRow[] = []
    const res = await runImport(fakeDb(divisions, competitions))

    const body = (await res.json()) as { created: unknown[] }
    expect(body.created).toEqual([])
    expect(divisions.map((d) => d.competition_id)).toEqual([competitions[0].id, competitions[0].id])
  })
})

// #482 — the admin ticks which divisions to take, so the import acts on those
// and leaves the rest entirely alone: neither created nor filed.
describe('importing only the divisions that were ticked', () => {
  it('creates only the ones named', async () => {
    mockFftt()
    const divisions: DivisionRow[] = []
    await runImport(fakeDb(divisions, []), 14, '18368', ['234612'])
    expect(divisions.map((d) => d.id)).toEqual(['234612'])
  })

  it('leaves an unticked division unfiled rather than attaching it anyway', async () => {
    mockFftt()
    const divisions: DivisionRow[] = [
      { id: '234322', phase_id: 'phase-27-1', display_name: 'GE 1', rank: 1, competition_id: null },
      { id: '234612', phase_id: 'phase-27-1', display_name: 'GE 7', rank: 2, competition_id: null },
    ]
    const competitions: CompetitionRow[] = []
    await runImport(fakeDb(divisions, competitions), 14, '18368', ['234322'])

    expect(divisions.find((d) => d.id === '234322')?.competition_id).toBe(competitions[0].id)
    expect(divisions.find((d) => d.id === '234612')?.competition_id).toBeNull()
  })

  // An older client sends no list at all, and gets what the import always did.
  it('acts on everything when no list is sent', async () => {
    mockFftt()
    const divisions: DivisionRow[] = []
    await runImport(fakeDb(divisions, []))
    expect(divisions).toHaveLength(2)
  })
})
