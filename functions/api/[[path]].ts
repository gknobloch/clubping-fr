import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { authApp, bearer, userFromToken, type Env } from './auth'
import { seasonIdFromFftt, seasonIdFromName, seasonNameFromFftt } from '../../src/lib/season'
import { ffttIdFromIri, orderDivisions, playersPerGameFor, PLAYERS_PER_GAME_DEFAULT, type FfttDivision } from '../../src/lib/ffttDivisions'
import { FFTT_PHASES, localPhaseId, phaseOrderKey } from '../../src/lib/ffttPhases'
import { type FfttClubTeam } from '../../src/lib/ffttTeams'
import { selectPoolForGroup, type FfttMatch, type FfttMatchTeam, type FfttPool } from '../../src/lib/ffttGames'

const app = new Hono<Env>().basePath('/api')

// Public endpoints that must work without a session (you're not logged in yet).
const PUBLIC_PATH = /^\/api\/auth\/(email\/|oauth$)/

// Image endpoints are served to <img> / <Image> tags, which can't send the
// Bearer header — so GETs to them are public (read-only, non-sensitive logos /
// avatars). Writes (PUT/DELETE) still go through the guard below.
const PUBLIC_IMAGE_PATH = /^\/api\/(clubs\/[^/]+\/logo|players\/[^/]+\/avatar)$/

// Session guard (#98): every /api route except the public auth + image endpoints
// requires a valid Bearer session. Bypassed locally via AUTH_GUARD_DISABLED so
// the dev user-picker login (no server session) still works in development.
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (PUBLIC_PATH.test(path) || c.env.AUTH_GUARD_DISABLED === 'true') return next()
  if (c.req.method === 'GET' && PUBLIC_IMAGE_PATH.test(path)) return next()
  const token = bearer(c.req.header('Authorization'))
  const user = token ? await userFromToken(c.env.DB, token) : null
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  return next()
})

// Authentication (email OTP + Google/Apple OAuth).
app.route('/auth', authApp)

// --- Helpers ---
const bool = (v: unknown) => v === 1 || v === true
const jsonParse = (v: unknown): unknown => {
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
  return v ?? []
}
const jsonStr = (v: unknown) => JSON.stringify(v)

// --- GET /api/data — return all entities ---
app.get('/data', async (c) => {
  const db = c.env.DB
  const [
    seasonsR, phasesR, divisionsR, clubsR, addressesR, channelsR,
    groupsR, teamsR, matchDaysR, gamesR,
    availsR, selectionsR, usersR, avatarsR, clubLogosR,
  ] = await Promise.all([
    db.prepare('SELECT * FROM seasons').all(),
    db.prepare('SELECT * FROM phases').all(),
    db.prepare('SELECT * FROM divisions').all(),
    db.prepare('SELECT * FROM clubs').all(),
    db.prepare('SELECT * FROM club_addresses').all(),
    db.prepare('SELECT * FROM club_channels ORDER BY sort_order').all(),
    db.prepare('SELECT * FROM groups_tbl').all(),
    db.prepare('SELECT * FROM teams').all(),
    db.prepare('SELECT * FROM match_days').all(),
    db.prepare('SELECT * FROM games').all(),
    db.prepare('SELECT * FROM game_availabilities').all(),
    db.prepare('SELECT * FROM game_selections').all(),
    db.prepare('SELECT * FROM users').all(),
    // Only the version marker — the image bytes are served separately so this
    // bulk payload stays light.
    db.prepare('SELECT user_id, updated_at FROM player_avatars').all(),
    db.prepare('SELECT club_id, updated_at FROM club_logos').all(),
  ])
  const avatarUpdatedAt = new Map(
    avatarsR.results.map((r) => [r.user_id as string, r.updated_at as string]),
  )
  const logoUpdatedAt = new Map(
    clubLogosR.results.map((r) => [r.club_id as string, r.updated_at as string]),
  )

  const addrByClub = new Map<string, unknown[]>()
  for (const a of addressesR.results) {
    const cid = a.club_id as string
    if (!addrByClub.has(cid)) addrByClub.set(cid, [])
    addrByClub.get(cid)!.push({
      id: a.id, label: a.label, street: a.street,
      postalCode: a.postal_code, city: a.city, isDefault: bool(a.is_default),
    })
  }

  // Channels are pre-sorted by sort_order in the query above.
  const channelsByClub = new Map<string, unknown[]>()
  for (const ch of channelsR.results) {
    const cid = ch.club_id as string
    if (!channelsByClub.has(cid)) channelsByClub.set(cid, [])
    channelsByClub.get(cid)!.push({
      id: ch.id, type: ch.type, link: ch.link, sortOrder: ch.sort_order,
      ...(ch.display_name ? { displayName: ch.display_name } : {}),
    })
  }

  return c.json({
    seasons: seasonsR.results.map(r => ({
      id: r.id, displayName: r.display_name, status: r.status,
    })),
    phases: phasesR.results.map(r => ({
      id: r.id, seasonId: r.season_id, name: r.name, displayName: r.display_name,
      // Fallback for databases that haven't run migration 0012 yet: PR
      // previews share the production D1 but never run migrations, so the
      // old is_active/is_archived columns may still be what exists.
      status: r.status ?? (bool(r.is_active) ? 'active' : bool(r.is_archived) ? 'archived' : 'upcoming'),
    })),
    divisions: divisionsR.results.map(r => ({
      id: r.id, phaseId: r.phase_id, displayName: r.display_name,
      rank: r.rank, playersPerGame: r.players_per_game,
      isArchived: bool(r.is_archived),
      ...(r.parent_id ? { parentId: r.parent_id } : {}),
    })),
    clubs: clubsR.results.map(r => ({
      id: r.id, affiliationNumber: r.affiliation_number, displayName: r.display_name,
      isArchived: bool(r.is_archived),
      addresses: addrByClub.get(r.id as string) ?? [],
      channels: channelsByClub.get(r.id as string) ?? [],
      ...(logoUpdatedAt.has(r.id as string)
        ? { logoUpdatedAt: logoUpdatedAt.get(r.id as string) }
        : {}),
    })),
    groups: groupsR.results.map(r => ({
      id: r.id, divisionId: r.division_id, number: r.number, teamIds: jsonParse(r.team_ids),
      isArchived: bool(r.is_archived),
    })),
    // Players are the projection of users where is_player = 1.
    players: usersR.results.filter(r => bool(r.is_player)).map(r => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name,
      licenseNumber: r.license_number, email: r.email, phone: r.phone ?? '',
      ...(r.birth_date ? { birthDate: r.birth_date } : {}),
      ...(r.birth_place ? { birthPlace: r.birth_place } : {}),
      status: r.status, clubId: r.club_id ?? '',
      ...(avatarUpdatedAt.has(r.id as string)
        ? { avatarUpdatedAt: avatarUpdatedAt.get(r.id as string) }
        : {}),
    })),
    teams: teamsR.results.map(r => ({
      id: r.id, clubId: r.club_id, phaseId: r.phase_id, number: r.number,
      divisionId: r.division_id, groupId: r.group_id, gameLocationId: r.game_location_id,
      defaultDay: r.default_day, defaultTime: r.default_time, captainId: r.captain_id,
      isArchived: bool(r.is_archived),
      playerIds: jsonParse(r.player_ids),
      ...(r.roster_initial_points ? { rosterInitialPoints: jsonParse(r.roster_initial_points) } : {}),
      ...(r.color ? { color: r.color } : {}),
      ...(r.whatsapp_link ? { whatsappLink: r.whatsapp_link } : {}),
    })),
    matchDays: matchDaysR.results.map(r => ({
      id: r.id, groupId: r.group_id, number: r.number, date: r.date,
    })),
    games: gamesR.results.map(r => ({
      id: r.id, matchDayId: r.match_day_id, homeTeamId: r.home_team_id,
      awayTeamId: r.away_team_id, ...(r.time ? { time: r.time } : {}),
    })),
    gameAvailabilities: availsR.results.map(r => ({
      id: r.id, gameId: r.game_id, playerId: r.player_id, status: r.status,
      ...(r.overridden_by ? { overriddenBy: r.overridden_by } : {}),
    })),
    gameSelections: selectionsR.results.map(r => ({
      id: r.id, gameId: r.game_id, teamId: r.team_id, playerIds: jsonParse(r.player_ids),
    })),
    users: usersR.results.map(r => ({
      id: r.id, email: r.email, role: r.role, isPlayer: bool(r.is_player),
      ...(r.first_name ? { firstName: r.first_name } : {}),
      ...(r.last_name ? { lastName: r.last_name } : {}),
      ...(r.license_number ? { licenseNumber: r.license_number } : {}),
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.birth_date ? { birthDate: r.birth_date } : {}),
      ...(r.birth_place ? { birthPlace: r.birth_place } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.club_id ? { clubId: r.club_id } : {}),
    })),
  })
})

// --- Seasons ---
const SEASON_STATUSES = ['active', 'upcoming', 'archived']

// Demotion is chronology-aware (#227): what stops being active is archived
// when it is older than what becomes active, but goes back to 'upcoming' when
// it is newer (rolling back to an older phase/season).
async function demoteActivePhases(db: Env['Bindings']['DB'], exceptId: string, newKey: number) {
  const actives = await db.prepare(
    "SELECT id, season_id, name FROM phases WHERE status = 'active' AND id != ?",
  ).bind(exceptId).all()
  for (const r of actives.results) {
    const demoted = phaseOrderKey(r.season_id as string, r.name as string) < newKey ? 'archived' : 'upcoming'
    await db.prepare('UPDATE phases SET status = ? WHERE id = ?').bind(demoted, r.id).run()
  }
}

async function demoteActiveSeasons(db: Env['Bindings']['DB'], newSeasonId: string) {
  const actives = await db.prepare(
    "SELECT id FROM seasons WHERE status = 'active' AND id != ?",
  ).bind(newSeasonId).all()
  for (const r of actives.results) {
    const demoted = Number(r.id) < Number(newSeasonId) ? 'archived' : 'upcoming'
    await db.prepare('UPDATE seasons SET status = ? WHERE id = ?').bind(demoted, r.id).run()
  }
}

// Mirror of the phase→season cascade (#227): activating a season keeps the
// active phase when it already belongs to it, otherwise switches to that
// season's most recent non-archived phase (Phase 2 over Phase 1) — or none
// when the season has no phases yet.
async function alignActivePhaseToSeason(db: Env['Bindings']['DB'], seasonId: string) {
  const active = await db.prepare("SELECT id, season_id FROM phases WHERE status = 'active'").all()
  const coherent = active.results.length > 0 && active.results.every(r => r.season_id === seasonId)
  if (coherent) return
  const latest = await db.prepare(
    "SELECT id, name FROM phases WHERE season_id = ? AND status != 'archived' ORDER BY name DESC LIMIT 1",
  ).bind(seasonId).first()
  // No phase to activate → compare against the season alone (phase 0).
  await demoteActivePhases(db, (latest?.id as string) ?? '', phaseOrderKey(seasonId, (latest?.name as string) ?? ''))
  if (latest) await db.prepare("UPDATE phases SET status = 'active' WHERE id = ?").bind(latest.id).run()
}

// The FFTT GraphQL API and the dafunker proxy both occasionally hiccup on a
// single request (observed in production: a teams import failing with a 502
// right after an identical one had succeeded, more than once even with a
// single retry). A few attempts with growing backoff absorb that without
// masking a genuinely-down upstream; a per-attempt timeout keeps one slow
// request from eating the whole budget.
const RETRY_DELAYS_MS = [300, 700, 1500]
const FETCH_TIMEOUT_MS = 8000

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      if (res.ok) return res
    } catch {
      // fall through to retry
    } finally {
      clearTimeout(timeout)
    }
  }
  return null
}

// FFTT GraphQL API — source of truth for season ids and names (#217).
const FFTT_GRAPHQL_URL = 'https://apiv2.fftt.com/api/graphql'

// Run a GraphQL query against the FFTT API; null when unreachable/invalid.
async function ffttGraphql<T>(query: string): Promise<T | null> {
  const res = await fetchWithRetry(FFTT_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res) return null
  try {
    const body = await res.json() as { data?: T }
    return body.data ?? null
  } catch {
    return null
  }
}

type FfttEdges<N> = { edges?: Array<{ node?: N }> }

async function fetchFfttCurrentSeason(): Promise<{ id: string; displayName: string } | null> {
  const data = await ffttGraphql<{ seasons?: FfttEdges<{ id?: string; name?: string }> }>(
    '{ seasons(current: true) { edges { node { id name } } } }',
  )
  const node = data?.seasons?.edges?.[0]?.node
  if (!node?.id || !node.name) return null
  return { id: seasonIdFromFftt(node.id), displayName: seasonNameFromFftt(node.name) }
}

// GET /seasons/fftt-current — the FFTT current season + whether it exists
// locally and with which status (an existing-but-archived season should be
// offered for activation, not silently ignored — #223).
app.get('/seasons/fftt-current', async (c) => {
  const fftt = await fetchFfttCurrentSeason()
  if (!fftt) return c.json({ error: 'fftt_unavailable' }, 502)
  const existing = await c.env.DB.prepare('SELECT status FROM seasons WHERE id = ?').bind(fftt.id).first()
  return c.json({ ...fftt, exists: !!existing, ...(existing ? { status: existing.status } : {}) })
})

// POST /seasons/import-current — import the FFTT current season, make it
// active, and archive the previously active season(s).
app.post('/seasons/import-current', async (c) => {
  const db = c.env.DB
  const fftt = await fetchFfttCurrentSeason()
  if (!fftt) return c.json({ error: 'fftt_unavailable' }, 502)
  const existing = await db.prepare('SELECT id FROM seasons WHERE id = ?').bind(fftt.id).first()
  if (existing) return c.json({ error: 'already_exists' }, 409)
  const activeR = await db.prepare("SELECT id FROM seasons WHERE status = 'active'").all()
  await demoteActiveSeasons(db, fftt.id)
  await db.prepare("INSERT INTO seasons (id, display_name, status) VALUES (?, ?, 'active')")
    .bind(fftt.id, fftt.displayName).run()
  await alignActivePhaseToSeason(db, fftt.id)
  return c.json({
    season: { id: fftt.id, displayName: fftt.displayName, status: 'active' },
    archivedSeasonIds: activeR.results.map(r => r.id as string),
  })
})

app.post('/seasons', async (c) => {
  const d = await c.req.json()
  // The id is always derived from the name (FFTT convention), never trusted
  // from the client — this is what prevents garbage seasons.
  const displayName = typeof d.displayName === 'string' ? d.displayName.trim() : ''
  const id = seasonIdFromName(displayName)
  if (!id) return c.json({ error: 'invalid_name' }, 400)
  const existing = await c.env.DB.prepare('SELECT id FROM seasons WHERE id = ?').bind(id).first()
  if (existing) return c.json({ error: 'already_exists' }, 409)
  const status = SEASON_STATUSES.includes(d.status) ? d.status : 'upcoming'
  if (status === 'active') await demoteActiveSeasons(c.env.DB, id)
  await c.env.DB.prepare('INSERT INTO seasons (id, display_name, status) VALUES (?, ?, ?)')
    .bind(id, displayName, status).run()
  if (status === 'active') await alignActivePhaseToSeason(c.env.DB, id)
  return c.json({ id, displayName, status })
})

app.patch('/seasons/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('displayName' in p) {
    // Renaming keeps the id (fixed at creation) but must stay a valid season name.
    const displayName = typeof p.displayName === 'string' ? p.displayName.trim() : ''
    if (!seasonIdFromName(displayName)) return c.json({ error: 'invalid_name' }, 400)
    s.push('display_name = ?'); v.push(displayName)
  }
  if ('status' in p) {
    if (!SEASON_STATUSES.includes(p.status)) return c.json({ error: 'invalid_status' }, 400)
    s.push('status = ?'); v.push(p.status)
  }
  if (s.length) {
    // Single-active invariant: activating a season demotes the previous one
    // (archived when older, back to 'upcoming' when newer).
    if (p.status === 'active') await demoteActiveSeasons(c.env.DB, id)
    v.push(id)
    await c.env.DB.prepare(`UPDATE seasons SET ${s.join(', ')} WHERE id = ?`).bind(...v).run()
    // Season→phase cascade (#227), symmetric with the phase→season one.
    if (p.status === 'active') await alignActivePhaseToSeason(c.env.DB, id)
  }
  return c.json({ ok: true })
})

// --- FFTT divisions import (#219) ---

// GET /fftt/organizations — locally cached FFTT organizations (never hits FFTT).
app.get('/fftt/organizations', async (c) => {
  const r = await c.env.DB.prepare('SELECT id, type, identifier, name FROM organizations ORDER BY type, name').all()
  return c.json({ organizations: r.results })
})

// POST /fftt/organizations/refresh — re-fetch the list from FFTT and replace the cache.
app.post('/fftt/organizations/refresh', async (c) => {
  let members: Array<{ '@type': string; id: number; identifier: string; name: string }>
  try {
    const res = await fetch('https://apiv2.fftt.com/api/organizations/all')
    if (!res.ok) return c.json({ error: 'fftt_unavailable' }, 502)
    const body = await res.json() as { 'hydra:member'?: typeof members }
    if (!body['hydra:member']?.length) return c.json({ error: 'fftt_unavailable' }, 502)
    members = body['hydra:member']
  } catch {
    return c.json({ error: 'fftt_unavailable' }, 502)
  }
  const db = c.env.DB
  const now = new Date().toISOString()
  const stmts = [
    db.prepare('DELETE FROM organizations'),
    ...members.map((m) =>
      db.prepare('INSERT INTO organizations (id, type, identifier, name, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(String(m.id), m['@type'], m.identifier, m.name, now),
    ),
  ]
  // Chunked: D1 batches are capped well below the ~130 rows FFTT returns.
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  const r = await db.prepare('SELECT id, type, identifier, name FROM organizations ORDER BY type, name').all()
  return c.json({ organizations: r.results })
})

// Fetch the championship contest (identifier "1") then its divisions from FFTT.
// null = FFTT unreachable; contest null = no championship for those params.
async function fetchFfttDivisions(organizationId: number, seasonId: number, phase: number): Promise<{
  contest: { id: string; name: string } | null
  divisions: FfttDivision[]
} | null> {
  const contestData = await ffttGraphql<{ contests?: FfttEdges<{ id: string; name: string }> }>(
    `{ contests(divisions_organization_id: ${organizationId} season_id: ${seasonId} identifier: "1") { edges { node { id name } } } }`,
  )
  if (contestData === null) return null
  const contestNode = contestData.contests?.edges?.[0]?.node
  if (!contestNode) return { contest: null, divisions: [] }
  const contestId = ffttIdFromIri(contestNode.id)
  const divData = await ffttGraphql<{
    divisions?: FfttEdges<{ id: string; identifier: string; name: string; parent: { id: string } | null }>
  }>(
    `{ divisions(contest_id: ${Number(contestId)} organization_id: ${organizationId} phase_id: ${phase}) { edges { node { id identifier name parent { id } } } } }`,
  )
  if (divData === null) return null
  const divisions: FfttDivision[] = (divData.divisions?.edges ?? []).flatMap((e) => e.node ? [{
    id: ffttIdFromIri(e.node.id),
    identifier: e.node.identifier,
    name: e.node.name,
    parentId: e.node.parent ? ffttIdFromIri(e.node.parent.id) : null,
  }] : [])
  return { contest: { id: contestId, name: contestNode.name }, divisions }
}

const importParams = (organizationId: unknown, seasonId: unknown, phase: unknown) => {
  const org = Number(organizationId), season = Number(seasonId), ph = Number(phase)
  const knownPhase = FFTT_PHASES.some((p) => Number(p.id) === ph)
  if (!Number.isInteger(org) || org <= 0 || !Number.isInteger(season) || season <= 0 || !knownPhase) return null
  return { org, season, ph }
}

// Existing divisions of a phase, for skip-matching by FFTT id or name.
async function phaseDivisions(db: Env['Bindings']['DB'], phaseId: string) {
  const r = await db.prepare('SELECT id, display_name, rank FROM divisions WHERE phase_id = ?').bind(phaseId).all()
  return {
    ids: new Set(r.results.map((x) => x.id as string)),
    names: new Set(r.results.map((x) => (x.display_name as string).toLowerCase())),
    maxRank: r.results.reduce((m, x) => Math.max(m, x.rank as number), 0),
  }
}

// GET /fftt/divisions-preview — ordered division list for (organization, season, phase),
// flagging the ones that already exist locally.
app.get('/fftt/divisions-preview', async (c) => {
  const p = importParams(c.req.query('organizationId'), c.req.query('seasonId'), c.req.query('phase'))
  if (!p) return c.json({ error: 'invalid_params' }, 400)
  const result = await fetchFfttDivisions(p.org, p.season, p.ph)
  if (!result) return c.json({ error: 'fftt_unavailable' }, 502)
  if (!result.contest) return c.json({ error: 'no_contest' }, 404)
  const phaseRow = await c.env.DB.prepare('SELECT id FROM phases WHERE season_id = ? AND name = ?')
    .bind(String(p.season), `Phase ${p.ph}`).first()
  const existing = phaseRow
    ? await phaseDivisions(c.env.DB, phaseRow.id as string)
    : { ids: new Set<string>(), names: new Set<string>(), maxRank: 0 }
  return c.json({
    contest: result.contest,
    phaseExists: !!phaseRow,
    divisions: orderDivisions(result.divisions).map((d, i) => ({
      id: d.id, identifier: d.identifier, name: d.name, rank: i + 1,
      playersPerGame: playersPerGameFor(d.identifier),
      exists: existing.ids.has(d.id) || existing.names.has(d.name.toLowerCase()),
    })),
  })
})

type ImportedPhase = { id: string; seasonId: unknown; name: unknown; displayName: unknown; status: unknown }
type ImportedDivision = {
  id: string; phaseId: string; displayName: string; rank: number; playersPerGame: number; isArchived: boolean
  /** FFTT id of the parent division (#236); the local match may not exist yet — see importDivisions. */
  parentId?: string
}

// Core of the divisions import: re-fetches from FFTT (never trusts a client
// list), creates the phase if missing (inactive), inserts the divisions not
// already present, ranked after any existing ones. Shared by
// POST /divisions/import and the teams import (#229), which auto-imports the
// divisions of a phase when a team's division is unknown locally.
async function importDivisions(db: Env['Bindings']['DB'], p: { org: number; season: number; ph: number }): Promise<
  | { phase: ImportedPhase; createdPhase: boolean; created: ImportedDivision[]; skipped: Array<{ id: string; name: string }> }
  | 'season_not_found' | 'fftt_unavailable' | 'no_divisions'
> {
  const season = await db.prepare('SELECT id, display_name FROM seasons WHERE id = ?').bind(String(p.season)).first()
  if (!season) return 'season_not_found'
  const result = await fetchFfttDivisions(p.org, p.season, p.ph)
  if (!result) return 'fftt_unavailable'
  if (!result.contest || result.divisions.length === 0) return 'no_divisions'

  const phaseName = `Phase ${p.ph}`
  let phaseRow = await db.prepare(
    'SELECT id, season_id, name, display_name, status FROM phases WHERE season_id = ? AND name = ?',
  ).bind(String(p.season), phaseName).first()
  const createdPhase = !phaseRow
  if (!phaseRow) {
    const displayName = `${season.display_name} ${phaseName}`
    const id = localPhaseId(p.season, p.ph)
    // Created 'upcoming' on purpose: activation stays a manual step on /phases.
    await db.prepare("INSERT INTO phases (id, season_id, name, display_name, status) VALUES (?, ?, ?, ?, 'upcoming')")
      .bind(id, String(p.season), phaseName, displayName).run()
    phaseRow = { id, season_id: String(p.season), name: phaseName, display_name: displayName, status: 'upcoming' }
  }
  const phaseId = phaseRow.id as string

  const existing = await phaseDivisions(db, phaseId)
  let rank = existing.maxRank
  const created: ImportedDivision[] = []
  const skipped: Array<{ id: string; name: string }> = []
  for (const d of orderDivisions(result.divisions)) {
    if (existing.ids.has(d.id) || existing.names.has(d.name.toLowerCase())) {
      skipped.push({ id: d.id, name: d.name })
      continue
    }
    rank += 1
    created.push({
      id: d.id, phaseId, displayName: d.name, rank,
      playersPerGame: playersPerGameFor(d.identifier), isArchived: false,
      ...(d.parentId ? { parentId: d.parentId } : {}),
    })
  }
  if (created.length) {
    await db.batch(created.map((d) =>
      db.prepare('INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .bind(d.id, d.phaseId, d.displayName, d.rank, d.playersPerGame, d.parentId ?? null),
    ))
  }
  return {
    phase: {
      id: phaseId, seasonId: phaseRow.season_id, name: phaseRow.name,
      displayName: phaseRow.display_name, status: phaseRow.status,
    },
    createdPhase,
    created,
    skipped,
  }
}

app.post('/divisions/import', async (c) => {
  const b = await c.req.json()
  const p = importParams(b.organizationId, b.seasonId, b.phase)
  if (!p) return c.json({ error: 'invalid_params' }, 400)
  const result = await importDivisions(c.env.DB, p)
  if (result === 'season_not_found') return c.json({ error: 'season_not_found' }, 404)
  if (result === 'fftt_unavailable') return c.json({ error: 'fftt_unavailable' }, 502)
  if (result === 'no_divisions') return c.json({ error: 'no_divisions' }, 404)
  return c.json(result)
})

// --- FFTT teams import (#229, transport reworked in #231 follow-up) ---
// FFTT blocks Cloudflare's egress IPs: server-side fetches fail
// systematically (the fallback cache never saw a single successful fetch)
// while the same requests succeed from any browser — and apiv2 sends
// `access-control-allow-origin: *`. The client therefore queries apiv2
// GraphQL directly and sends the parsed payload here. This API stays
// authoritative over validation and persistence; an admin-supplied payload
// grants no privilege beyond the existing manual CRUD endpoints.

const NUMERIC_ID = /^\d{1,10}$/

// Strict shape validation of the client-fetched FFTT teams payload.
function parseTeamsPayload(raw: unknown): FfttClubTeam[] {
  if (!Array.isArray(raw)) return []
  const out: FfttClubTeam[] = []
  const seen = new Set<string>()
  for (const t of raw.slice(0, 60)) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    if (typeof x.id !== 'string' || !NUMERIC_ID.test(x.id) || seen.has(x.id)) continue
    if (typeof x.divisionId !== 'string' || !NUMERIC_ID.test(x.divisionId)) continue
    if (typeof x.poolId !== 'string' || !NUMERIC_ID.test(x.poolId)) continue
    if (typeof x.number !== 'number' || !Number.isInteger(x.number) || x.number < 1 || x.number > 99) continue
    if (x.phase !== null && !(typeof x.phase === 'number' && Number.isInteger(x.phase) && x.phase >= 1 && x.phase <= 3)) continue
    const poolNumber = typeof x.poolNumber === 'number' && Number.isInteger(x.poolNumber) && x.poolNumber >= 1 && x.poolNumber <= 99
      ? x.poolNumber : null
    const divisionParentId = typeof x.divisionParentId === 'string' && NUMERIC_ID.test(x.divisionParentId)
      ? x.divisionParentId : null
    seen.add(x.id)
    out.push({
      id: x.id,
      number: x.number,
      phase: x.phase as number | null,
      divisionId: x.divisionId,
      divisionName: (typeof x.divisionName === 'string' && x.divisionName.trim())
        ? x.divisionName.trim().slice(0, 80) : `Division ${x.divisionId}`,
      divisionParentId,
      poolId: x.poolId,
      poolNumber,
      label: typeof x.label === 'string' ? x.label.trim().slice(0, 80) : '',
    })
  }
  return out.sort((a, b) => (a.phase ?? 9) - (b.phase ?? 9) || a.number - b.number)
}

function parseSeasonPayload(raw: unknown): { id: string; displayName: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || !/^\d{1,3}$/.test(s.id)) return null
  if (typeof s.displayName !== 'string' || !s.displayName || s.displayName.length > 20) return null
  return { id: s.id, displayName: s.displayName }
}

// Shared context for the teams preview and import: the club plus the
// validated client-fetched FFTT payload (current season + engaged teams).
async function teamsImportContext(db: Env['Bindings']['DB'], clubId: string, seasonRaw: unknown, teamsRaw: unknown) {
  const club = await db.prepare('SELECT id, affiliation_number, display_name FROM clubs WHERE id = ?')
    .bind(clubId).first()
  if (!club) return { error: 'club_not_found' as const }
  const season = parseSeasonPayload(seasonRaw)
  if (!season) return { error: 'invalid_payload' as const }
  const teams = parseTeamsPayload(teamsRaw)
  const seasonRow = await db.prepare('SELECT id, display_name FROM seasons WHERE id = ?').bind(season.id).first()
  return { club, teams, season: { ...season, exists: !!seasonRow }, seasonRow }
}

// Existing teams of a club, for skip-matching by FFTT id or (phase, number).
async function clubTeamKeys(db: Env['Bindings']['DB'], clubId: string) {
  const r = await db.prepare('SELECT id, phase_id, number FROM teams WHERE club_id = ?').bind(clubId).all()
  return {
    ids: new Set(r.results.map((t) => t.id as string)),
    byPhaseNumber: new Set(r.results.map((t) => `${t.phase_id}|${t.number}`)),
  }
}

// POST /fftt/teams-preview — the client-fetched FFTT teams flagged with what
// an import would do (already present, division to auto-create, …). POST
// because the browser sends the FFTT payload it fetched (see the transport
// note above); the flags are computed here, against D1.
app.post('/fftt/teams-preview', async (c) => {
  const b = await c.req.json()
  const clubId = typeof b.clubId === 'string' ? b.clubId : ''
  if (!clubId) return c.json({ error: 'invalid_params' }, 400)
  const ctx = await teamsImportContext(c.env.DB, clubId, b.season, b.ffttTeams)
  if ('error' in ctx) {
    return c.json({ error: ctx.error }, ctx.error === 'club_not_found' ? 404 : 400)
  }

  const divisionRows = await c.env.DB.prepare('SELECT id, display_name, phase_id FROM divisions').all()
  const divisionById = new Map(divisionRows.results.map((d) => [d.id as string, d]))
  const existing = await clubTeamKeys(c.env.DB, clubId)

  return c.json({
    club: { id: ctx.club.id, displayName: ctx.club.display_name },
    season: ctx.season,
    teams: ctx.teams.map((t) => {
      const division = divisionById.get(t.divisionId)
      const exists = existing.ids.has(t.id) ||
        (!!division && existing.byPhaseNumber.has(`${division.phase_id}|${t.number}`))
      return {
        id: t.id,
        // Simplified display name, consistent with existing teams ("PPA Rixheim 2").
        name: `${ctx.club.display_name} ${t.number}`,
        number: t.number, phase: t.phase,
        divisionId: t.divisionId,
        divisionName: (division?.display_name as string | undefined) ?? t.divisionName,
        divisionExists: !!division,
        poolNumber: t.poolNumber,
        exists,
        // Importable = not already there, and the division is known or can be
        // auto-imported (needs a detectable phase and an existing season).
        importable: !exists && ctx.season.exists && (!!division || t.phase !== null),
      }
    }),
  })
})

type TeamImportOverride = { id: string; gameLocationId: string; defaultDay: string; defaultTime: string }

// POST /teams/import — validates the client-fetched FFTT payload (see the
// transport note above), auto-creates missing divisions (and their phase)
// from that payload, creates/reuses the FFTT pools as groups, and inserts
// only the requested teams with their own venue / day / time. Rosters stay
// empty: completing each team remains a manual step.
app.post('/teams/import', async (c) => {
  const b = await c.req.json()
  const clubId = typeof b.clubId === 'string' ? b.clubId : ''
  const requested: TeamImportOverride[] = Array.isArray(b.teams)
    ? b.teams.filter((t: unknown): t is TeamImportOverride =>
        !!t && typeof t === 'object' &&
        typeof (t as TeamImportOverride).id === 'string' &&
        typeof (t as TeamImportOverride).gameLocationId === 'string' &&
        typeof (t as TeamImportOverride).defaultDay === 'string' &&
        typeof (t as TeamImportOverride).defaultTime === 'string')
    : []
  if (!clubId || requested.length === 0) return c.json({ error: 'invalid_params' }, 400)
  const db = c.env.DB

  const addressRows = await db.prepare('SELECT id FROM club_addresses WHERE club_id = ?').bind(clubId).all()
  const validLocationIds = new Set(addressRows.results.map((a) => a.id as string))

  const ctx = await teamsImportContext(db, clubId, b.season, b.ffttTeams)
  if ('error' in ctx) {
    return c.json({ error: ctx.error }, ctx.error === 'club_not_found' ? 404 : 400)
  }
  if (!ctx.season.exists || !ctx.seasonRow) return c.json({ error: 'season_not_found' }, 404)

  const requestedById = new Map(requested.map((r) => [r.id, r]))
  const teamsToImport = ctx.teams.filter((t) => requestedById.has(t.id))

  // Create missing divisions (and their phase) straight from the payload —
  // the #219 championship import can't run server-side anymore (FFTT blocks
  // Cloudflare egress) and remains the precise path for full division lists.
  const createdPhases: ImportedPhase[] = []
  const createdDivisions: ImportedDivision[] = []
  const divisionRows = await db.prepare('SELECT id, phase_id FROM divisions').all()
  const divisionById = new Map(divisionRows.results.map((d) => [d.id as string, d]))
  const phaseRowsAll = await db.prepare('SELECT id, season_id, name, display_name, status FROM phases').all()
  const phaseByKey = new Map(phaseRowsAll.results.map((p) => [`${p.season_id}|${p.name}`, p]))
  const rankRows = await db.prepare('SELECT phase_id, MAX(rank) AS max_rank FROM divisions GROUP BY phase_id').all()
  const maxRankByPhase = new Map(rankRows.results.map((r) => [r.phase_id as string, (r.max_rank as number | null) ?? 0]))

  for (const t of teamsToImport) {
    if (divisionById.has(t.divisionId) || t.phase === null) continue
    const phaseName = `Phase ${t.phase}`
    let phaseRow = phaseByKey.get(`${ctx.season.id}|${phaseName}`)
    if (!phaseRow) {
      // Created 'upcoming' on purpose: activation stays a manual step on /phases.
      const id = localPhaseId(ctx.season.id, t.phase)
      const displayName = `${ctx.seasonRow.display_name} ${phaseName}`
      await db.prepare("INSERT INTO phases (id, season_id, name, display_name, status) VALUES (?, ?, ?, ?, 'upcoming')")
        .bind(id, ctx.season.id, phaseName, displayName).run()
      phaseRow = { id, season_id: ctx.season.id, name: phaseName, display_name: displayName, status: 'upcoming' }
      phaseByKey.set(`${ctx.season.id}|${phaseName}`, phaseRow)
      createdPhases.push({ id, seasonId: ctx.season.id, name: phaseName, displayName, status: 'upcoming' })
    }
    const rank = (maxRankByPhase.get(phaseRow.id as string) ?? 0) + 1
    maxRankByPhase.set(phaseRow.id as string, rank)
    // Players-per-game defaults to 4: the payload has no division identifier
    // (e.g. "GE7P1") to apply the known overrides — adjustable on /divisions.
    // parentId (#236) is the FFTT id of a division that may not exist locally
    // yet (e.g. a lower pool imported before its parent) — same caveat as the
    // dedicated divisions import; the lock simply has no effect until it does.
    await db.prepare('INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .bind(t.divisionId, phaseRow.id, t.divisionName, rank, PLAYERS_PER_GAME_DEFAULT, t.divisionParentId).run()
    const division = {
      id: t.divisionId, phaseId: phaseRow.id as string, displayName: t.divisionName,
      rank, playersPerGame: PLAYERS_PER_GAME_DEFAULT, isArchived: false,
      ...(t.divisionParentId ? { parentId: t.divisionParentId } : {}),
    }
    createdDivisions.push(division)
    divisionById.set(t.divisionId, { id: t.divisionId, phase_id: phaseRow.id })
  }

  const groupRows = await db.prepare('SELECT id, division_id, number, team_ids, is_archived FROM groups_tbl').all()
  const groups = groupRows.results.map((g) => ({
    id: g.id as string, divisionId: g.division_id as string, number: g.number as number,
    teamIds: (jsonParse(g.team_ids) as string[]) ?? [], isArchived: bool(g.is_archived),
  }))
  const existing = await clubTeamKeys(db, clubId)

  const createdGroups: typeof groups = []
  const touchedGroups = new Map<string, (typeof groups)[number]>()
  const createdTeams: Array<Record<string, unknown>> = []
  const skipped: Array<{ id: string; label: string; reason: 'already_exists' | 'division_missing' | 'invalid_location' }> = []

  for (const t of teamsToImport) {
    const override = requestedById.get(t.id)!
    const division = divisionById.get(t.divisionId)
    if (!division) {
      skipped.push({ id: t.id, label: t.label, reason: 'division_missing' })
      continue
    }
    const phaseId = division.phase_id as string
    // Re-verify existence right before insert (never trust the preview's
    // snapshot — a concurrent import or manual creation may have landed since).
    if (existing.ids.has(t.id) || existing.byPhaseNumber.has(`${phaseId}|${t.number}`)) {
      skipped.push({ id: t.id, label: t.label, reason: 'already_exists' })
      continue
    }
    if (!validLocationIds.has(override.gameLocationId)) {
      skipped.push({ id: t.id, label: t.label, reason: 'invalid_location' })
      continue
    }

    // Reuse the pool when known by FFTT id or by (division, number); create it
    // otherwise, FFTT-aligned (local group id = FFTT pool id).
    let group = groups.find((g) => g.id === t.poolId) ??
      (t.poolNumber !== null
        ? groups.find((g) => g.divisionId === t.divisionId && g.number === t.poolNumber)
        : undefined)
    if (!group) {
      group = { id: t.poolId, divisionId: t.divisionId, number: t.poolNumber ?? 1, teamIds: [], isArchived: false }
      groups.push(group)
      createdGroups.push(group)
    }

    const team = {
      id: t.id, clubId, phaseId, number: t.number,
      divisionId: t.divisionId, groupId: group.id, gameLocationId: override.gameLocationId,
      defaultDay: override.defaultDay, defaultTime: override.defaultTime,
      captainId: '', playerIds: [] as string[], isArchived: false,
    }
    group.teamIds = [...group.teamIds, team.id]
    touchedGroups.set(group.id, group)
    createdTeams.push(team)
    existing.ids.add(t.id)
    existing.byPhaseNumber.add(`${phaseId}|${t.number}`)
  }

  const stmts = [
    ...createdGroups.map((g) =>
      db.prepare('INSERT INTO groups_tbl (id, division_id, number, team_ids, is_archived) VALUES (?, ?, ?, ?, 0)')
        .bind(g.id, g.divisionId, g.number, jsonStr(g.teamIds))),
    ...[...touchedGroups.values()].filter((g) => !createdGroups.includes(g)).map((g) =>
      db.prepare('UPDATE groups_tbl SET team_ids = ? WHERE id = ?').bind(jsonStr(g.teamIds), g.id)),
    ...createdTeams.map((t) =>
      db.prepare(
        `INSERT INTO teams (id, club_id, phase_id, number, division_id, group_id, game_location_id, default_day, default_time, captain_id, player_ids, is_archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]', 0)`,
      ).bind(t.id, t.clubId, t.phaseId, t.number, t.divisionId, t.groupId, t.gameLocationId, t.defaultDay, t.defaultTime)),
  ]
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))

  return c.json({
    createdPhases,
    createdDivisions,
    // Created + updated groups, in their final state, for client-side upsert.
    groups: [...touchedGroups.values()],
    createdTeams,
    skipped,
  })
})

// --- FFTT groups import (#237) ---
// Same trust model as the teams/games imports above: the browser fetched the
// division's pools from apiv2 (FFTT blocks Cloudflare egress), this API only
// accepts sane shapes and re-validates against D1 before persisting. Unlike
// the teams import (which only creates the pools that have an engaged team of
// the importing club), this creates every pool of the division — including
// ones with no team yet — so the group structure can be set up ahead of time.

function parsePoolsList(raw: unknown): Array<{ id: string; number: number | null }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ id: string; number: number | null }> = []
  const seen = new Set<string>()
  for (const p of raw.slice(0, 40)) {
    if (!p || typeof p !== 'object') continue
    const x = p as Record<string, unknown>
    if (typeof x.id !== 'string' || !NUMERIC_ID.test(x.id) || seen.has(x.id)) continue
    const number = typeof x.poolNumber === 'number' && Number.isInteger(x.poolNumber) && x.poolNumber >= 1 && x.poolNumber <= 99
      ? x.poolNumber : null
    seen.add(x.id)
    out.push({ id: x.id, number })
  }
  return out
}

type GroupsImportContext =
  | { error: 'division_not_found' }
  | {
      division: { id: string; displayName: string }
      pools: Array<{ id: string; number: number | null }>
      existingIds: Set<string>
      existingNumbers: Set<number>
    }

async function groupsImportContext(db: Env['Bindings']['DB'], divisionId: string, poolsRaw: unknown): Promise<GroupsImportContext> {
  const division = await db.prepare('SELECT id, display_name FROM divisions WHERE id = ?').bind(divisionId).first()
  if (!division) return { error: 'division_not_found' }
  const existingRows = await db.prepare('SELECT id, number FROM groups_tbl WHERE division_id = ?').bind(divisionId).all()
  return {
    division: { id: division.id as string, displayName: division.display_name as string },
    pools: parsePoolsList(poolsRaw),
    existingIds: new Set(existingRows.results.map((g) => g.id as string)),
    existingNumbers: new Set(existingRows.results.map((g) => g.number as number)),
  }
}

// POST /fftt/groups-preview — the client-fetched division pools flagged with
// what an import would do (already present or not). POST because the browser
// sends the FFTT payload it fetched (see the transport note above).
app.post('/fftt/groups-preview', async (c) => {
  const b = await c.req.json()
  const divisionId = typeof b.divisionId === 'string' ? b.divisionId : ''
  if (!divisionId) return c.json({ error: 'invalid_params' }, 400)
  const ctx = await groupsImportContext(c.env.DB, divisionId, b.pools)
  if ('error' in ctx) return c.json({ error: ctx.error }, 404)
  return c.json({
    divisionId,
    divisionName: ctx.division.displayName,
    groups: ctx.pools.map((p) => ({
      id: p.id,
      number: p.number,
      exists: ctx.existingIds.has(p.id) || (p.number !== null && ctx.existingNumbers.has(p.number)),
    })),
  })
})

// POST /groups/import — creates the division's FFTT pools not already present
// locally (by pool id, or by poule number when the id is unknown), leaving
// existing groups (and their teams) untouched.
app.post('/groups/import', async (c) => {
  const b = await c.req.json()
  const divisionId = typeof b.divisionId === 'string' ? b.divisionId : ''
  if (!divisionId) return c.json({ error: 'invalid_params' }, 400)
  const ctx = await groupsImportContext(c.env.DB, divisionId, b.pools)
  if ('error' in ctx) return c.json({ error: ctx.error }, 404)

  const created: Array<{ id: string; divisionId: string; number: number; teamIds: string[]; isArchived: boolean }> = []
  const skipped: Array<{ id: string; number: number | null }> = []
  for (const p of ctx.pools) {
    if (ctx.existingIds.has(p.id) || (p.number !== null && ctx.existingNumbers.has(p.number))) {
      skipped.push({ id: p.id, number: p.number })
      continue
    }
    const number = p.number ?? 1
    created.push({ id: p.id, divisionId, number, teamIds: [], isArchived: false })
    ctx.existingIds.add(p.id)
    ctx.existingNumbers.add(number)
  }
  if (created.length) {
    await c.env.DB.batch(created.map((g) =>
      c.env.DB.prepare('INSERT INTO groups_tbl (id, division_id, number, team_ids, is_archived) VALUES (?, ?, ?, ?, 0)')
        .bind(g.id, g.divisionId, g.number, jsonStr(g.teamIds))))
  }
  return c.json({ created, skipped })
})

// --- FFTT games import (#231) ---

// Fetch every pool of an FFTT division ("group" in their schema) with its
// matches, or null when FFTT is unreachable. The pool NAME (poule number)
// travels along because apiv2 pool ids are a different id space than the
// SPID cx_poule ids we use as local group ids — pools are matched to groups
// by team membership or poule number, never by id (see selectPoolForGroup).
// Strict shape validation of the client-fetched pools payload
// ([{ divisionId, pools: [{ id, poolNumber, matches: FfttMatch[] }] }]).
// Same trust model as the teams import: the browser fetched it from apiv2
// (FFTT blocks Cloudflare egress), the server only accepts sane shapes.
function parseMatchSide(raw: unknown): FfttMatchTeam | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.teamId !== 'string' || !NUMERIC_ID.test(s.teamId)) return null
  if (typeof s.teamName !== 'string' || !s.teamName.trim()) return null
  const teamNumber = typeof s.teamNumber === 'number' && Number.isInteger(s.teamNumber) && s.teamNumber >= 1 && s.teamNumber <= 99
    ? s.teamNumber : null
  const clubIdentifier = typeof s.clubIdentifier === 'string' && /^\d{0,10}$/.test(s.clubIdentifier) ? s.clubIdentifier : ''
  return {
    teamId: s.teamId,
    teamName: s.teamName.trim().slice(0, 80),
    teamNumber,
    clubIdentifier,
    clubName: typeof s.clubName === 'string' ? s.clubName.trim().slice(0, 80) : '',
  }
}

function parsePoolsPayload(raw: unknown): Map<string, FfttPool[]> {
  const byDivision = new Map<string, FfttPool[]>()
  if (!Array.isArray(raw)) return byDivision
  for (const entry of raw.slice(0, 30)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.divisionId !== 'string' || !NUMERIC_ID.test(e.divisionId) || byDivision.has(e.divisionId)) continue
    if (!Array.isArray(e.pools)) continue
    const pools: FfttPool[] = []
    for (const p of (e.pools as unknown[]).slice(0, 30)) {
      if (!p || typeof p !== 'object') continue
      const x = p as Record<string, unknown>
      if (typeof x.id !== 'string' || !NUMERIC_ID.test(x.id)) continue
      const poolNumber = typeof x.poolNumber === 'number' && Number.isInteger(x.poolNumber) && x.poolNumber >= 1 && x.poolNumber <= 99
        ? x.poolNumber : null
      const matches: FfttMatch[] = []
      const seenMatchIds = new Set<string>()
      for (const m of (Array.isArray(x.matches) ? x.matches as unknown[] : []).slice(0, 200)) {
        if (!m || typeof m !== 'object') continue
        const y = m as Record<string, unknown>
        if (typeof y.id !== 'string' || !NUMERIC_ID.test(y.id) || seenMatchIds.has(y.id)) continue
        if (typeof y.round !== 'number' || !Number.isInteger(y.round) || y.round < 1 || y.round > 99) continue
        if (typeof y.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(y.date)) continue
        const home = parseMatchSide(y.home)
        const away = parseMatchSide(y.away)
        if (!home || !away) continue
        seenMatchIds.add(y.id)
        matches.push({ id: y.id, round: y.round, date: y.date, home, away })
      }
      matches.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id, undefined, { numeric: true }))
      pools.push({ id: x.id, poolNumber, matches })
    }
    byDivision.set(e.divisionId, pools)
  }
  return byDivision
}

type GamesGroupError = 'group_not_found' | 'fftt_unavailable' | 'pool_not_found' | 'calendar_not_published'
interface GamesGroupContext {
  groupId: string
  error?: GamesGroupError
  group?: { id: string; divisionId: string; number: number; teamIds: string[] }
  divisionName?: string
  phaseId?: string
  matches?: FfttMatch[]
}

// Shared context for the games preview and import: for each requested group,
// its division/phase and the matching pool's matches out of the validated
// client-fetched payload. A division absent from the payload means the
// browser couldn't fetch it from apiv2.
async function gamesImportContext(db: Env['Bindings']['DB'], groupIds: string[], poolsRaw: unknown): Promise<GamesGroupContext[]> {
  const groupRows = await db.prepare('SELECT id, division_id, number, team_ids FROM groups_tbl').all()
  const groupById = new Map(groupRows.results.map((g) => [g.id as string, g]))
  const divisionRows = await db.prepare('SELECT id, display_name, phase_id FROM divisions').all()
  const divisionById = new Map(divisionRows.results.map((d) => [d.id as string, d]))
  const poolsByDivision = parsePoolsPayload(poolsRaw)

  return groupIds.map((groupId): GamesGroupContext => {
    const g = groupById.get(groupId)
    if (!g) return { groupId, error: 'group_not_found' }
    const division = divisionById.get(g.division_id as string)
    if (!division) return { groupId, error: 'group_not_found' }
    const group = {
      id: groupId, divisionId: g.division_id as string, number: g.number as number,
      teamIds: (jsonParse(g.team_ids) as string[]) ?? [],
    }
    // Even error rows keep the division/poule identity so the UI can name
    // them ("GE 2 Phase 1 · Poule 9") instead of a raw group id.
    const identity = {
      groupId, group,
      divisionName: division.display_name as string,
      phaseId: division.phase_id as string,
    }
    const pools = poolsByDivision.get(g.division_id as string)
    if (pools === undefined) return { ...identity, error: 'fftt_unavailable' }
    const pool = selectPoolForGroup(pools, group)
    if (!pool) {
      // No pools at all, or only empty shells: the FFTT simply hasn't
      // published this division's calendar on apiv2 yet (season start) —
      // that's not a mismatch on our side.
      const published = pools.some((p) => p.matches.length > 0)
      return { ...identity, error: published ? 'pool_not_found' : 'calendar_not_published' }
    }
    return { ...identity, matches: pool.matches }
  })
}

// Resolve an FFTT match side to a local team of the given phase: by FFTT id
// first (imported teams share ids), then by club affiliation + team number.
function makeTeamResolver(
  clubRows: Array<Record<string, unknown>>, teamRows: Array<Record<string, unknown>>,
) {
  const clubByAffiliation = new Map(clubRows.map((c) => [c.affiliation_number as string, c.id as string]))
  const teamByIdPhase = new Map(teamRows.map((t) => [`${t.id}|${t.phase_id}`, t.id as string]))
  const teamByClubNumberPhase = new Map(teamRows.map((t) => [`${t.club_id}|${t.number}|${t.phase_id}`, t.id as string]))
  const teamIds = new Set(teamRows.map((t) => t.id as string))
  return {
    clubByAffiliation,
    teamIds,
    resolve(side: FfttMatchTeam, phaseId: string): string | null {
      const byId = teamByIdPhase.get(`${side.teamId}|${phaseId}`)
      if (byId) return byId
      const clubId = side.clubIdentifier ? clubByAffiliation.get(side.clubIdentifier) : undefined
      if (clubId && side.teamNumber !== null) {
        return teamByClubNumberPhase.get(`${clubId}|${side.teamNumber}|${phaseId}`) ?? null
      }
      return null
    },
    register(teamId: string, clubId: string, number: number, phaseId: string, ffttTeamId: string) {
      teamIds.add(teamId)
      teamByIdPhase.set(`${ffttTeamId}|${phaseId}`, teamId)
      teamByClubNumberPhase.set(`${clubId}|${number}|${phaseId}`, teamId)
    },
  }
}

const parseGroupIds = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 100) : []

// POST /fftt/games-preview — per group: what an import would do
// (rounds/matches found, games and opponents to create). POST because the
// browser sends the FFTT pools payload it fetched (see the transport note on
// the teams import); the flags are computed here, against D1.
app.post('/fftt/games-preview', async (c) => {
  const b = await c.req.json()
  const groupIds = parseGroupIds(b.groupIds)
  if (groupIds.length === 0) return c.json({ error: 'invalid_params' }, 400)
  const db = c.env.DB
  const ctxs = await gamesImportContext(db, groupIds, b.pools)

  const [clubRows, teamRows, mdRows, gameRows] = await Promise.all([
    db.prepare('SELECT id, affiliation_number FROM clubs').all(),
    db.prepare('SELECT id, club_id, phase_id, number FROM teams').all(),
    db.prepare('SELECT id, group_id, number FROM match_days').all(),
    db.prepare('SELECT id FROM games').all(),
  ])
  const resolver = makeTeamResolver(clubRows.results, teamRows.results)
  const matchDayKeys = new Set(mdRows.results.map((m) => `${m.group_id}|${m.number}`))
  const gameIds = new Set(gameRows.results.map((g) => g.id as string))

  const newClubIdentifiers = new Set<string>()
  const newTeamKeys = new Set<string>()
  const groups = ctxs.map((ctx) => {
    if (ctx.error || !ctx.group || !ctx.matches) {
      return {
        groupId: ctx.groupId,
        error: ctx.error ?? 'group_not_found',
        // Present whenever the group exists locally — lets the UI name the
        // row ("GE 2 Phase 1 · Poule 9") instead of showing a raw id.
        ...(ctx.group ? { groupNumber: ctx.group.number } : {}),
        ...(ctx.divisionName ? { divisionName: ctx.divisionName } : {}),
      }
    }
    const rounds = new Set<number>()
    let newGames = 0, existingGames = 0, newMatchDays = 0
    const groupNewTeams = new Set<string>()
    const seenRounds = new Set<number>()
    for (const m of ctx.matches) {
      rounds.add(m.round)
      if (!seenRounds.has(m.round)) {
        seenRounds.add(m.round)
        if (!matchDayKeys.has(`${ctx.groupId}|${m.round}`)) newMatchDays++
      }
      if (gameIds.has(m.id)) existingGames++
      else newGames++
      for (const side of [m.home, m.away]) {
        if (resolver.resolve(side, ctx.phaseId!)) continue
        groupNewTeams.add(`${side.clubIdentifier}|${side.teamName}`)
        newTeamKeys.add(`${side.clubIdentifier}|${side.teamName}|${ctx.phaseId}`)
        if (side.clubIdentifier && !resolver.clubByAffiliation.has(side.clubIdentifier)) {
          newClubIdentifiers.add(side.clubIdentifier)
        }
      }
    }
    return {
      groupId: ctx.groupId,
      groupNumber: ctx.group.number,
      divisionName: ctx.divisionName,
      rounds: rounds.size,
      matches: ctx.matches.length,
      newMatchDays,
      newGames,
      existingGames,
      newTeams: groupNewTeams.size,
    }
  })

  return c.json({ groups, totals: { newClubs: newClubIdentifiers.size, newTeams: newTeamKeys.size } })
})

// POST /games/import — re-fetches from FFTT (never trusts a client list),
// auto-creates missing opponent clubs/teams, upserts the journées by
// (group, round) — refreshing dates on re-import — and inserts the games not
// already present (matched by FFTT match id, or same pairing on the same
// journée for manually created ones). Scores are not imported (#231); manual
// game times are never touched.
app.post('/games/import', async (c) => {
  const b = await c.req.json()
  const groupIds = parseGroupIds(b.groupIds)
  if (groupIds.length === 0) return c.json({ error: 'invalid_params' }, 400)
  const db = c.env.DB
  const ctxs = await gamesImportContext(db, groupIds, b.pools)

  const [clubRows, teamRows, mdRows, gameRows] = await Promise.all([
    db.prepare('SELECT id, affiliation_number FROM clubs').all(),
    db.prepare('SELECT id, club_id, phase_id, number FROM teams').all(),
    db.prepare('SELECT id, group_id, number, date FROM match_days').all(),
    db.prepare('SELECT id, match_day_id, home_team_id, away_team_id FROM games').all(),
  ])
  const resolver = makeTeamResolver(clubRows.results, teamRows.results)
  const matchDayByKey = new Map(mdRows.results.map((m) => [`${m.group_id}|${m.number}`, m]))
  const gameIds = new Set(gameRows.results.map((g) => g.id as string))
  const pairingsByMatchDay = new Map<string, Set<string>>()
  for (const g of gameRows.results) {
    const key = g.match_day_id as string
    if (!pairingsByMatchDay.has(key)) pairingsByMatchDay.set(key, new Set())
    pairingsByMatchDay.get(key)!.add(`${g.home_team_id}|${g.away_team_id}`)
    pairingsByMatchDay.get(key)!.add(`${g.away_team_id}|${g.home_team_id}`)
  }

  const createdClubs: Array<Record<string, unknown>> = []
  const createdTeams: Array<Record<string, unknown>> = []
  const createdMatchDays: Array<Record<string, unknown>> = []
  let updatedMatchDays: Array<Record<string, unknown>> = []
  // Pre-import dates of updated journées: a round spanning several dates makes
  // the walk flip the date back and forth, and an entry that lands back on its
  // original date is a no-op, not an update.
  const originalDates = new Map<string, string>()
  const createdGames: Array<Record<string, unknown>> = []
  const touchedGroups = new Map<string, { id: string; divisionId: string; number: number; teamIds: string[]; isArchived: boolean }>()
  const skippedGroups: Array<{ groupId: string; reason: GamesGroupError }> = []
  let existingGames = 0, skippedMatches = 0

  // Auto-created club ids are FFTT-aligned on the affiliation number, which
  // doubles as the natural dedup key across groups in one import.
  const clubIdFor = (side: FfttMatchTeam): string | null => {
    if (!side.clubIdentifier) return null
    const existing = resolver.clubByAffiliation.get(side.clubIdentifier)
    if (existing) return existing
    const id = `club-fftt-${side.clubIdentifier}`
    const displayName = side.clubName || side.teamName.replace(/\s*\(?\d+\)?\s*$/, '')
    createdClubs.push({ id, affiliationNumber: side.clubIdentifier, displayName, isArchived: false, addresses: [], channels: [] })
    resolver.clubByAffiliation.set(side.clubIdentifier, id)
    return id
  }

  for (const ctx of ctxs) {
    if (ctx.error || !ctx.group || !ctx.matches || !ctx.phaseId) {
      skippedGroups.push({ groupId: ctx.groupId, reason: ctx.error ?? 'group_not_found' })
      continue
    }
    const group = touchedGroups.get(ctx.groupId) ??
      { ...ctx.group, isArchived: false, teamIds: [...ctx.group.teamIds] }

    const teamIdFor = (side: FfttMatchTeam): string | null => {
      const existing = resolver.resolve(side, ctx.phaseId!)
      if (existing) return existing
      const clubId = clubIdFor(side)
      if (!clubId || side.teamNumber === null) return null
      // FFTT team ids are stable across phases, so the id may already be a
      // team row of another phase — suffix to keep the primary key unique.
      const id = resolver.teamIds.has(side.teamId) ? `${side.teamId}-${ctx.phaseId}` : side.teamId
      createdTeams.push({
        id, clubId, phaseId: ctx.phaseId, number: side.teamNumber,
        divisionId: group.divisionId, groupId: group.id, gameLocationId: '',
        defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false,
      })
      resolver.register(id, clubId, side.teamNumber, ctx.phaseId!, side.teamId)
      if (!group.teamIds.includes(id)) group.teamIds.push(id)
      touchedGroups.set(group.id, group)
      return id
    }

    for (const m of ctx.matches) {
      const mdKey = `${ctx.groupId}|${m.round}`
      let md = matchDayByKey.get(mdKey)
      if (!md) {
        md = { id: `md-fftt-${ctx.groupId}-r${m.round}`, group_id: ctx.groupId, number: m.round, date: m.date }
        matchDayByKey.set(mdKey, md)
        createdMatchDays.push({ id: md.id, groupId: ctx.groupId, number: m.round, date: m.date })
      } else if (md.date !== m.date) {
        // FFTT can stagger one round across days; the journée keeps a single
        // date, so the last one seen wins (stable across re-imports since
        // matches are ordered by round then id).
        const created = createdMatchDays.find((x) => x.id === md!.id)
        if (created) {
          created.date = m.date
        } else {
          const updated = updatedMatchDays.find((x) => x.id === md!.id)
          if (updated) updated.date = m.date
          else {
            originalDates.set(md.id as string, md.date as string)
            updatedMatchDays.push({ id: md.id, groupId: md.group_id, number: md.number, date: m.date })
          }
        }
        md.date = m.date
      }

      if (gameIds.has(m.id)) { existingGames++; continue }
      const homeId = teamIdFor(m.home)
      const awayId = teamIdFor(m.away)
      if (!homeId || !awayId) { skippedMatches++; continue }
      // A manually created game for the same pairing on the same journée
      // counts as existing — never duplicate it.
      const pairings = pairingsByMatchDay.get(md.id as string)
      if (pairings?.has(`${homeId}|${awayId}`)) { existingGames++; continue }
      if (!pairingsByMatchDay.has(md.id as string)) pairingsByMatchDay.set(md.id as string, new Set())
      pairingsByMatchDay.get(md.id as string)!.add(`${homeId}|${awayId}`)
      pairingsByMatchDay.get(md.id as string)!.add(`${awayId}|${homeId}`)
      gameIds.add(m.id)
      createdGames.push({ id: m.id, matchDayId: md.id, homeTeamId: homeId, awayTeamId: awayId })
    }
  }

  // Journées whose date walked back to its pre-import value are no-ops.
  updatedMatchDays = updatedMatchDays.filter((m) => m.date !== originalDates.get(m.id as string))

  const stmts = [
    ...createdClubs.map((cl) =>
      db.prepare('INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES (?, ?, ?, 0)')
        .bind(cl.id, cl.affiliationNumber, cl.displayName)),
    ...createdTeams.map((t) =>
      db.prepare(
        `INSERT INTO teams (id, club_id, phase_id, number, division_id, group_id, game_location_id, default_day, default_time, captain_id, player_ids, is_archived)
         VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '[]', 0)`,
      ).bind(t.id, t.clubId, t.phaseId, t.number, t.divisionId, t.groupId)),
    ...[...touchedGroups.values()].map((g) =>
      db.prepare('UPDATE groups_tbl SET team_ids = ? WHERE id = ?').bind(jsonStr(g.teamIds), g.id)),
    ...createdMatchDays.map((m) =>
      db.prepare('INSERT INTO match_days (id, group_id, number, date) VALUES (?, ?, ?, ?)')
        .bind(m.id, m.groupId, m.number, m.date)),
    ...updatedMatchDays.map((m) =>
      db.prepare('UPDATE match_days SET date = ? WHERE id = ?').bind(m.date, m.id)),
    ...createdGames.map((g) =>
      db.prepare('INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time) VALUES (?, ?, ?, ?, NULL)')
        .bind(g.id, g.matchDayId, g.homeTeamId, g.awayTeamId)),
  ]
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))

  return c.json({
    createdClubs,
    createdTeams,
    // Groups whose team list changed, in their final state (client-side upsert).
    groups: [...touchedGroups.values()],
    createdMatchDays,
    updatedMatchDays,
    createdGames,
    skippedGroups,
    existingGames,
    skippedMatches,
  })
})

// --- Schedule document import (#260) ---
// Alternative to the FFTT-API-based imports above: the browser parses an
// uploaded PDF/image (a poule schedule sheet) with a regex parser targeting
// FFTT's own export template (no LLM — see src/lib/ffttScheduleDocument.ts)
// and the admin confirms, per document, which existing phase/division/group
// it maps to (or that new ones should be created). The document never
// carries genuine FFTT ids for division/pool/team/match — only the club
// affiliation number is a real, stable FFTT identifier — so this reuses the
// *matching logic* of the imports above (makeTeamResolver, club-by-affiliation,
// team-by-club-number-phase) but not their NUMERIC_ID-gated payload shapes,
// which assume every id is FFTT-issued.

interface ScheduleDocTeamInput { name: string; number: number; affiliationNumber: string }
interface ScheduleDocMatchInput { homeName: string; homeNumber: number; awayName: string; awayNumber: number }
interface ScheduleDocJourneeInput { number: number; date: string; matches: ScheduleDocMatchInput[] }
interface ScheduleDocInput {
  seasonId: string
  phaseNumber: number
  /** Existing division chosen by the admin; null to create one from newDivisionLabel. */
  divisionId: string | null
  newDivisionLabel: string
  /** Existing group chosen by the admin; null to create one numbered newGroupNumber. */
  groupId: string | null
  newGroupNumber: number | null
  teams: ScheduleDocTeamInput[]
  journees: ScheduleDocJourneeInput[]
}

function parseScheduleDocTeams(raw: unknown): ScheduleDocTeamInput[] {
  if (!Array.isArray(raw)) return []
  const out: ScheduleDocTeamInput[] = []
  for (const t of raw.slice(0, 20)) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    if (typeof x.name !== 'string' || !x.name.trim()) continue
    if (typeof x.number !== 'number' || !Number.isInteger(x.number) || x.number < 1 || x.number > 99) continue
    if (typeof x.affiliationNumber !== 'string' || !/^\d{8}$/.test(x.affiliationNumber)) continue
    out.push({ name: x.name.trim().slice(0, 80), number: x.number, affiliationNumber: x.affiliationNumber })
  }
  return out
}

function parseScheduleDocJournees(raw: unknown): ScheduleDocJourneeInput[] {
  if (!Array.isArray(raw)) return []
  const out: ScheduleDocJourneeInput[] = []
  for (const j of raw.slice(0, 20)) {
    if (!j || typeof j !== 'object') continue
    const x = j as Record<string, unknown>
    if (typeof x.number !== 'number' || !Number.isInteger(x.number) || x.number < 1 || x.number > 99) continue
    if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) continue
    const matches: ScheduleDocMatchInput[] = []
    if (Array.isArray(x.matches)) {
      for (const m of x.matches.slice(0, 20)) {
        if (!m || typeof m !== 'object') continue
        const y = m as Record<string, unknown>
        if (typeof y.homeName !== 'string' || !y.homeName.trim()) continue
        if (typeof y.homeNumber !== 'number' || !Number.isInteger(y.homeNumber)) continue
        if (typeof y.awayName !== 'string' || !y.awayName.trim()) continue
        if (typeof y.awayNumber !== 'number' || !Number.isInteger(y.awayNumber)) continue
        matches.push({
          homeName: y.homeName.trim().slice(0, 80), homeNumber: y.homeNumber,
          awayName: y.awayName.trim().slice(0, 80), awayNumber: y.awayNumber,
        })
      }
    }
    out.push({ number: x.number, date: x.date, matches })
  }
  return out
}

function parseScheduleDocInput(raw: unknown): ScheduleDocInput | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Record<string, unknown>
  if (typeof x.seasonId !== 'string' || !/^\d{1,3}$/.test(x.seasonId)) return null
  if (typeof x.phaseNumber !== 'number' || !FFTT_PHASES.some((p) => Number(p.id) === x.phaseNumber)) return null
  const divisionId = typeof x.divisionId === 'string' && x.divisionId ? x.divisionId : null
  const newDivisionLabel = typeof x.newDivisionLabel === 'string' ? x.newDivisionLabel.trim().slice(0, 80) : ''
  if (!divisionId && !newDivisionLabel) return null
  const groupId = typeof x.groupId === 'string' && x.groupId ? x.groupId : null
  const newGroupNumber = typeof x.newGroupNumber === 'number'
    && Number.isInteger(x.newGroupNumber) && x.newGroupNumber >= 1 && x.newGroupNumber <= 99
    ? x.newGroupNumber : null
  if (!groupId && newGroupNumber === null) return null
  return {
    seasonId: x.seasonId, phaseNumber: x.phaseNumber, divisionId, newDivisionLabel, groupId, newGroupNumber,
    teams: parseScheduleDocTeams(x.teams), journees: parseScheduleDocJournees(x.journees),
  }
}

// The roster table and each journée's match rows are read by separate OCR
// passes over the same document, so the same team name can come back with
// slightly different spacing/punctuation each time it's read (confirmed
// against a real upload: one journée's mention of an otherwise-fine team
// silently failed to join because that one occurrence read with different
// whitespace) — normalize away everything but the letters/digits before
// keying the join, rather than requiring an exact string match.
function normalizeTeamNameKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Standard edit distance (insert/delete/substitute), used only as the
// fallback below when the exact normalized key misses.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const dp = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) dp[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j - 1], dp[j])
      prev = temp
    }
  }
  return dp[b.length]
}

// Confirmed against a real upload: the roster table and each journ\u00e9e's match
// rows are read by separate OCR passes, and normalizeTeamNameKey only
// absorbs spacing/punctuation drift between them \u2014 it can't fix an outright
// wrong letter ("ILLZACH TTSIB" on the roster line vs "ILLZACH TTSJB" on
// every single match line, an OCR I/J mix-up). When the exact key misses,
// fall back to the closest roster name *with the same team number* by edit
// distance \u2014 team number is a reliable, purely numeric anchor, so this only
// ever resolves ambiguity between candidates that already agree on it, and
// the distance cap keeps it to "one OCR slip", not "a different team".
function closestRosterNameForNumber(
  targetNormalized: string, candidates: Array<{ normalizedName: string; teamId: string }>,
): string | null {
  let best: { teamId: string; distance: number } | null = null
  for (const cand of candidates) {
    const distance = levenshtein(targetNormalized, cand.normalizedName)
    if (!best || distance < best.distance) best = { teamId: cand.teamId, distance }
  }
  if (!best) return null
  const maxAllowed = Math.max(1, Math.floor(targetNormalized.length * 0.2))
  return best.distance <= maxAllowed ? best.teamId : null
}

app.post('/schedule-documents/import', async (c) => {
  const b = await c.req.json()
  const schedules = (Array.isArray(b.schedules) ? b.schedules.slice(0, 10) : [])
    .map(parseScheduleDocInput)
    .filter((s): s is ScheduleDocInput => s !== null)
  if (schedules.length === 0) return c.json({ error: 'invalid_params' }, 400)

  const db = c.env.DB
  const [seasonRows, phaseRows, divisionRows, groupRows, clubRows, teamRows, mdRows, gameRows] = await Promise.all([
    db.prepare('SELECT id, display_name FROM seasons').all(),
    db.prepare('SELECT id, season_id, name, display_name, status FROM phases').all(),
    db.prepare('SELECT id, phase_id, display_name, rank, players_per_game FROM divisions').all(),
    db.prepare('SELECT id, division_id, number, team_ids FROM groups_tbl').all(),
    db.prepare('SELECT id, affiliation_number FROM clubs').all(),
    db.prepare('SELECT id, club_id, phase_id, number FROM teams').all(),
    db.prepare('SELECT id, group_id, number, date FROM match_days').all(),
    db.prepare('SELECT id, match_day_id, home_team_id, away_team_id FROM games').all(),
  ])

  const seasonById = new Map(seasonRows.results.map((s) => [s.id as string, s]))
  const phaseExists = new Set(phaseRows.results.map((p) => p.id as string))
  const divisionExists = new Set(divisionRows.results.map((d) => d.id as string))
  const divisionMaxRankByPhase = new Map<string, number>()
  for (const d of divisionRows.results) {
    const k = d.phase_id as string
    divisionMaxRankByPhase.set(k, Math.max(divisionMaxRankByPhase.get(k) ?? 0, d.rank as number))
  }
  type GroupState = { id: string; divisionId: string; number: number; teamIds: string[]; isArchived: boolean }
  const groupById = new Map<string, GroupState>(groupRows.results.map((g) => [g.id as string, {
    id: g.id as string, divisionId: g.division_id as string, number: g.number as number,
    teamIds: (jsonParse(g.team_ids) as string[]) ?? [], isArchived: false,
  }]))
  const groupNumbersByDivision = new Map<string, Set<number>>()
  for (const g of groupById.values()) {
    if (!groupNumbersByDivision.has(g.divisionId)) groupNumbersByDivision.set(g.divisionId, new Set())
    groupNumbersByDivision.get(g.divisionId)!.add(g.number)
  }
  const resolver = makeTeamResolver(clubRows.results, teamRows.results)
  const matchDayByKey = new Map(mdRows.results.map((m) => [`${m.group_id}|${m.number}`, m]))
  const pairingsByMatchDay = new Map<string, Set<string>>()
  for (const g of gameRows.results) {
    const key = g.match_day_id as string
    if (!pairingsByMatchDay.has(key)) pairingsByMatchDay.set(key, new Set())
    pairingsByMatchDay.get(key)!.add(`${g.home_team_id}|${g.away_team_id}`)
    pairingsByMatchDay.get(key)!.add(`${g.away_team_id}|${g.home_team_id}`)
  }

  const createdPhases: Array<{ id: string; seasonId: string; name: string; displayName: string; status: string }> = []
  const createdDivisions: Array<{ id: string; phaseId: string; displayName: string; rank: number; playersPerGame: number; isArchived: boolean }> = []
  const createdGroupIds = new Set<string>()
  const createdClubs: Array<{ id: string; affiliationNumber: string; displayName: string; isArchived: boolean; addresses: []; channels: [] }> = []
  const createdTeams: Array<Record<string, unknown>> = []
  const touchedGroups = new Map<string, GroupState>()
  const createdMatchDays: Array<{ id: string; groupId: string; number: number; date: string }> = []
  const createdGames: Array<{ id: string; matchDayId: string; homeTeamId: string; awayTeamId: string }> = []
  const skippedSchedules: Array<{ index: number; reason: string }> = []
  const skippedMatchDetails: Array<{ side: 'home' | 'away'; name: string; number: number }> = []
  let existingGames = 0
  let skippedMatches = 0

  let uidCounter = 0
  const localId = (prefix: string) => `${prefix}-doc-${Date.now()}-${uidCounter++}`

  const clubIdFor = (name: string, affiliationNumber: string): string => {
    const existing = resolver.clubByAffiliation.get(affiliationNumber)
    if (existing) return existing
    const id = `club-fftt-${affiliationNumber}`
    createdClubs.push({
      id, affiliationNumber, displayName: name.replace(/\s*\d+\s*$/, '').trim() || name,
      isArchived: false, addresses: [], channels: [],
    })
    resolver.clubByAffiliation.set(affiliationNumber, id)
    return id
  }

  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i]
    const season = seasonById.get(s.seasonId)
    if (!season) { skippedSchedules.push({ index: i, reason: 'season_not_found' }); continue }

    const phaseId = localPhaseId(s.seasonId, s.phaseNumber)
    if (!phaseExists.has(phaseId)) {
      const phaseName = `Phase ${s.phaseNumber}`
      const displayName = `${season.display_name as string} ${phaseName}`
      phaseExists.add(phaseId)
      createdPhases.push({ id: phaseId, seasonId: s.seasonId, name: phaseName, displayName, status: 'upcoming' })
    }

    let divisionId = s.divisionId
    if (divisionId && !divisionExists.has(divisionId)) {
      skippedSchedules.push({ index: i, reason: 'division_not_found' }); continue
    }
    if (!divisionId) {
      const rank = (divisionMaxRankByPhase.get(phaseId) ?? 0) + 1
      divisionMaxRankByPhase.set(phaseId, rank)
      divisionId = localId('div')
      divisionExists.add(divisionId)
      createdDivisions.push({
        id: divisionId, phaseId, displayName: s.newDivisionLabel, rank,
        playersPerGame: PLAYERS_PER_GAME_DEFAULT, isArchived: false,
      })
    }

    let groupId = s.groupId
    if (groupId && !groupById.has(groupId)) { skippedSchedules.push({ index: i, reason: 'group_not_found' }); continue }
    if (!groupId) {
      const number = s.newGroupNumber!
      groupId = localId('group')
      const group: GroupState = { id: groupId, divisionId, number, teamIds: [], isArchived: false }
      groupById.set(groupId, group)
      createdGroupIds.add(groupId)
      if (!groupNumbersByDivision.has(divisionId)) groupNumbersByDivision.set(divisionId, new Set())
      groupNumbersByDivision.get(divisionId)!.add(number)
    }

    const group = touchedGroups.get(groupId) ?? { ...groupById.get(groupId)!, teamIds: [...groupById.get(groupId)!.teamIds] }

    // Resolve every roster team once, keyed by (normalized name, number) for
    // the match join below — see normalizeTeamNameKey for why the key isn't
    // the raw name. rosterByNumber backs the closestRosterNameForNumber
    // fallback when a match's own OCR reading of the name doesn't exactly
    // match the roster's.
    const teamKeyToId = new Map<string, string>()
    const rosterByNumber = new Map<number, Array<{ normalizedName: string; teamId: string }>>()
    for (const t of s.teams) {
      const side: FfttMatchTeam = {
        teamId: `doc-${t.affiliationNumber}-${t.number}`, teamName: t.name,
        teamNumber: t.number, clubIdentifier: t.affiliationNumber, clubName: t.name,
      }
      let teamId = resolver.resolve(side, phaseId)
      if (!teamId) {
        const clubId = clubIdFor(t.name, t.affiliationNumber)
        teamId = resolver.teamIds.has(side.teamId) ? `${side.teamId}-${phaseId}` : side.teamId
        createdTeams.push({
          id: teamId, clubId, phaseId, number: t.number, divisionId, groupId,
          gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false,
        })
        resolver.register(teamId, clubId, t.number, phaseId, side.teamId)
      }
      if (!group.teamIds.includes(teamId)) group.teamIds.push(teamId)
      const normalizedName = normalizeTeamNameKey(t.name)
      teamKeyToId.set(`${normalizedName}|${t.number}`, teamId)
      if (!rosterByNumber.has(t.number)) rosterByNumber.set(t.number, [])
      rosterByNumber.get(t.number)!.push({ normalizedName, teamId })
    }
    touchedGroups.set(groupId, group)

    const resolveMatchTeamId = (name: string, number: number): string | null => {
      const normalizedName = normalizeTeamNameKey(name)
      const exact = teamKeyToId.get(`${normalizedName}|${number}`)
      if (exact) return exact
      return closestRosterNameForNumber(normalizedName, rosterByNumber.get(number) ?? [])
    }

    for (const j of s.journees) {
      const mdKey = `${groupId}|${j.number}`
      let md = matchDayByKey.get(mdKey)
      if (!md) {
        md = { id: localId('md'), group_id: groupId, number: j.number, date: j.date }
        matchDayByKey.set(mdKey, md)
        createdMatchDays.push({ id: md.id as string, groupId, number: j.number, date: j.date })
      }
      for (const m of j.matches) {
        const homeId = resolveMatchTeamId(m.homeName, m.homeNumber)
        const awayId = resolveMatchTeamId(m.awayName, m.awayNumber)
        // A team referenced in a match but absent from the roster table can't
        // be resolved to a club/affiliation — skip rather than guess, but
        // report exactly which side(s) and name/number: this used to fail
        // silently (or just as an opaque count), which made a single
        // OCR-garbled team name impossible to track down without re-reading
        // the raw OCR dump by hand.
        if (!homeId || !awayId) {
          skippedMatches++
          if (skippedMatchDetails.length < 30) {
            if (!homeId) skippedMatchDetails.push({ side: 'home', name: m.homeName, number: m.homeNumber })
            if (!awayId) skippedMatchDetails.push({ side: 'away', name: m.awayName, number: m.awayNumber })
          }
          continue
        }
        const mdId = md.id as string
        const pairings = pairingsByMatchDay.get(mdId)
        // Dedup by pairing-on-journée, not by game id: unlike the FFTT games
        // import, these ids have no stable external source, so re-uploading
        // the same document must still recognize matches already imported.
        if (pairings?.has(`${homeId}|${awayId}`)) { existingGames++; continue }
        if (!pairingsByMatchDay.has(mdId)) pairingsByMatchDay.set(mdId, new Set())
        pairingsByMatchDay.get(mdId)!.add(`${homeId}|${awayId}`)
        pairingsByMatchDay.get(mdId)!.add(`${awayId}|${homeId}`)
        createdGames.push({ id: localId('game'), matchDayId: mdId, homeTeamId: homeId, awayTeamId: awayId })
      }
    }
  }

  const stmts = [
    ...createdPhases.map((p) =>
      db.prepare("INSERT INTO phases (id, season_id, name, display_name, status) VALUES (?, ?, ?, ?, 'upcoming')")
        .bind(p.id, p.seasonId, p.name, p.displayName)),
    ...createdDivisions.map((d) =>
      db.prepare('INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id) VALUES (?, ?, ?, ?, ?, 0, NULL)')
        .bind(d.id, d.phaseId, d.displayName, d.rank, d.playersPerGame)),
    // OR IGNORE on clubs/teams: their ids are fully deterministic
    // (club-fftt-<affiliation>, and the FFTT-team-id-shaped doc-<affiliation>-<number>
    // for teams), so a leftover row from an earlier partial/retried import —
    // one this request's own freshly-queried resolver didn't happen to pick
    // up — can never collide with different data, only with itself; ignoring
    // the redundant insert keeps a retry safe instead of a hard 500.
    ...createdClubs.map((cl) =>
      db.prepare('INSERT OR IGNORE INTO clubs (id, affiliation_number, display_name, is_archived) VALUES (?, ?, ?, 0)')
        .bind(cl.id, cl.affiliationNumber, cl.displayName)),
    ...[...touchedGroups.values()].map((g) =>
      createdGroupIds.has(g.id)
        ? db.prepare('INSERT INTO groups_tbl (id, division_id, number, team_ids, is_archived) VALUES (?, ?, ?, ?, 0)')
          .bind(g.id, g.divisionId, g.number, jsonStr(g.teamIds))
        : db.prepare('UPDATE groups_tbl SET team_ids = ? WHERE id = ?').bind(jsonStr(g.teamIds), g.id)),
    ...createdTeams.map((t) =>
      db.prepare(
        `INSERT OR IGNORE INTO teams (id, club_id, phase_id, number, division_id, group_id, game_location_id, default_day, default_time, captain_id, player_ids, is_archived)
         VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '[]', 0)`,
      ).bind(t.id, t.clubId, t.phaseId, t.number, t.divisionId, t.groupId)),
    ...createdMatchDays.map((m) =>
      db.prepare('INSERT OR IGNORE INTO match_days (id, group_id, number, date) VALUES (?, ?, ?, ?)')
        .bind(m.id, m.groupId, m.number, m.date)),
    ...createdGames.map((g) =>
      db.prepare('INSERT OR IGNORE INTO games (id, match_day_id, home_team_id, away_team_id, time) VALUES (?, ?, ?, ?, NULL)')
        .bind(g.id, g.matchDayId, g.homeTeamId, g.awayTeamId)),
  ]
  try {
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  } catch (err) {
    console.error('schedule-documents/import batch failed', err)
    return c.json({ error: 'import_failed', message: err instanceof Error ? err.message : String(err) }, 500)
  }

  const allGroups = [...touchedGroups.values()]
  return c.json({
    createdPhases,
    createdDivisions,
    createdGroups: allGroups.filter((g) => createdGroupIds.has(g.id)),
    createdClubs,
    createdTeams,
    // Every touched group (created or team-list-updated) in its final state.
    groups: allGroups,
    createdMatchDays,
    createdGames,
    skippedSchedules,
    existingGames,
    skippedMatches,
    skippedMatchDetails,
  })
})

app.delete('/seasons/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Find phases belonging to this season
  const phasesR = await db.prepare('SELECT id FROM phases WHERE season_id = ?').bind(id).all()
  const phaseIds = phasesR.results.map(r => r.id as string)
  for (const phaseId of phaseIds) {
    // Find divisions in phase
    const divsR = await db.prepare('SELECT id FROM divisions WHERE phase_id = ?').bind(phaseId).all()
    const divIds = divsR.results.map(r => r.id as string)
    for (const divId of divIds) {
      // Find groups in division
      const grpsR = await db.prepare('SELECT id FROM groups_tbl WHERE division_id = ?').bind(divId).all()
      const grpIds = grpsR.results.map(r => r.id as string)
      // Delete match days in these groups
      for (const gid of grpIds) {
        // Delete games + availabilities + selections for match days in this group
        const mdsR = await db.prepare('SELECT id FROM match_days WHERE group_id = ?').bind(gid).all()
        for (const md of mdsR.results) {
          const mdGames = await db.prepare('SELECT id FROM games WHERE match_day_id = ?').bind(md.id).all()
          for (const g of mdGames.results) {
            await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(g.id).run()
            await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(g.id).run()
          }
          await db.prepare('DELETE FROM games WHERE match_day_id = ?').bind(md.id).run()
        }
        await db.prepare('DELETE FROM match_days WHERE group_id = ?').bind(gid).run()
        await db.prepare('DELETE FROM groups_tbl WHERE id = ?').bind(gid).run()
      }
      // Delete teams in division
      await db.prepare('DELETE FROM teams WHERE division_id = ?').bind(divId).run()
      await db.prepare('DELETE FROM divisions WHERE id = ?').bind(divId).run()
    }
    await db.prepare('DELETE FROM phases WHERE id = ?').bind(phaseId).run()
  }
  await db.prepare('DELETE FROM seasons WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// --- Phases ---

// The active (season · phase) combination must stay coherent (#227): activating
// a phase demotes every other active phase (#221, archived when older,
// 'upcoming' when newer) AND activates the phase's season (same demotion rule
// for the previous season).
async function activatePhaseCascade(db: Env['Bindings']['DB'], phaseId: string, seasonId: string, phaseName: string) {
  await demoteActivePhases(db, phaseId, phaseOrderKey(seasonId, phaseName))
  await demoteActiveSeasons(db, seasonId)
  await db.prepare("UPDATE seasons SET status = 'active' WHERE id = ?").bind(seasonId).run()
}

app.post('/phases', async (c) => {
  const d = await c.req.json()
  const existing = await c.env.DB.prepare('SELECT id FROM phases WHERE season_id = ? AND name = ?')
    .bind(d.seasonId, d.name).first()
  if (existing) return c.json({ error: 'already_exists' }, 409)
  const status = SEASON_STATUSES.includes(d.status) ? d.status : 'upcoming'
  if (status === 'active') await activatePhaseCascade(c.env.DB, d.id, d.seasonId, d.name)
  await c.env.DB.prepare(
    'INSERT INTO phases (id, season_id, name, display_name, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(d.id, d.seasonId, d.name, d.displayName, status).run()
  return c.json({ ok: true })
})

app.patch('/phases/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('seasonId' in p) { s.push('season_id = ?'); v.push(p.seasonId) }
  if ('name' in p) { s.push('name = ?'); v.push(p.name) }
  if ('displayName' in p) { s.push('display_name = ?'); v.push(p.displayName) }
  if ('status' in p) {
    if (!SEASON_STATUSES.includes(p.status)) return c.json({ error: 'invalid_status' }, 400)
    s.push('status = ?'); v.push(p.status)
  }
  if (s.length) {
    // Activating a phase cascades to its season (#227).
    if (p.status === 'active') {
      const row = await c.env.DB.prepare('SELECT season_id, name FROM phases WHERE id = ?').bind(id).first()
      if (row) await activatePhaseCascade(c.env.DB, id, row.season_id as string, row.name as string)
    }
    v.push(id)
    await c.env.DB.prepare(`UPDATE phases SET ${s.join(', ')} WHERE id = ?`).bind(...v).run()
  }
  return c.json({ ok: true })
})

// Delete phase (archived only) — cascades: divisions → groups → teams, match days → games → availabilities → selections
app.delete('/phases/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Find divisions in this phase
  const divsR = await db.prepare('SELECT id FROM divisions WHERE phase_id = ?').bind(id).all()
  const divIds = divsR.results.map(r => r.id as string)
  if (divIds.length > 0) {
    for (const divId of divIds) {
      // Find groups in this division
      const grpsR = await db.prepare('SELECT id FROM groups_tbl WHERE division_id = ?').bind(divId).all()
      const grpIds = grpsR.results.map(r => r.id as string)
      for (const grpId of grpIds) {
        // Find match days in this group → games → availabilities → selections
        const mdsR = await db.prepare('SELECT id FROM match_days WHERE group_id = ?').bind(grpId).all()
        for (const md of mdsR.results) {
          const mdId = md.id as string
          const gmsR = await db.prepare('SELECT id FROM games WHERE match_day_id = ?').bind(mdId).all()
          for (const gm of gmsR.results) {
            const gmId = gm.id as string
            await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(gmId).run()
            await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(gmId).run()
          }
          await db.prepare('DELETE FROM games WHERE match_day_id = ?').bind(mdId).run()
        }
        await db.prepare('DELETE FROM match_days WHERE group_id = ?').bind(grpId).run()
      }
      await db.prepare('DELETE FROM groups_tbl WHERE division_id = ?').bind(divId).run()
    }
    await db.prepare('DELETE FROM divisions WHERE phase_id = ?').bind(id).run()
  }
  // Delete teams in this phase (and their game references)
  const teamsR = await db.prepare('SELECT id FROM teams WHERE phase_id = ?').bind(id).all()
  for (const t of teamsR.results) {
    const tid = t.id as string
    const gamesR = await db.prepare('SELECT id FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(tid, tid).all()
    for (const gm of gamesR.results) {
      const gmId = gm.id as string
      await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(gmId).run()
      await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(gmId).run()
    }
    await db.prepare('DELETE FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(tid, tid).run()
  }
  await db.prepare('DELETE FROM teams WHERE phase_id = ?').bind(id).run()
  await db.prepare('DELETE FROM phases WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// --- Divisions ---
app.post('/divisions', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(d.id, d.phaseId, d.displayName, d.rank, d.playersPerGame, d.isArchived ? 1 : 0, d.parentId ?? null).run()
  return c.json({ ok: true })
})

app.patch('/divisions/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('phaseId' in p) { s.push('phase_id = ?'); v.push(p.phaseId) }
  if ('displayName' in p) { s.push('display_name = ?'); v.push(p.displayName) }
  if ('rank' in p) { s.push('rank = ?'); v.push(p.rank) }
  if ('playersPerGame' in p) { s.push('players_per_game = ?'); v.push(p.playersPerGame) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if ('parentId' in p) { s.push('parent_id = ?'); v.push(p.parentId ?? null) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE divisions SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// Delete division (archived only) — cascades: groups → teams → match days → games → availabilities → selections
app.delete('/divisions/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Find groups in this division
  const groupsR = await db.prepare('SELECT id FROM groups_tbl WHERE division_id = ?').bind(id).all()
  const groupIds = groupsR.results.map(r => r.id as string)
  for (const gid of groupIds) {
    // Find match days in this group
    const mdsR = await db.prepare('SELECT id FROM match_days WHERE group_id = ?').bind(gid).all()
    const mdIds = mdsR.results.map(r => r.id as string)
    for (const mdId of mdIds) {
      // Find games in this match day
      const gamesR = await db.prepare('SELECT id FROM games WHERE match_day_id = ?').bind(mdId).all()
      for (const game of gamesR.results) {
        await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(game.id).run()
        await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(game.id).run()
      }
      await db.prepare('DELETE FROM games WHERE match_day_id = ?').bind(mdId).run()
    }
    await db.prepare('DELETE FROM match_days WHERE group_id = ?').bind(gid).run()
    // Delete teams in this group
    await db.prepare('DELETE FROM teams WHERE group_id = ?').bind(gid).run()
  }
  // Delete groups
  await db.prepare('DELETE FROM groups_tbl WHERE division_id = ?').bind(id).run()
  // Delete division
  await db.prepare('DELETE FROM divisions WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

app.post('/divisions/:id/move', async (c) => {
  const id = c.req.param('id')
  const { otherId, myNewRank, otherNewRank } = await c.req.json()
  const db = c.env.DB
  await db.batch([
    db.prepare('UPDATE divisions SET rank = ? WHERE id = ?').bind(myNewRank, id),
    db.prepare('UPDATE divisions SET rank = ? WHERE id = ?').bind(otherNewRank, otherId),
  ])
  return c.json({ ok: true })
})

// --- Clubs ---
app.post('/clubs', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES (?, ?, ?, ?)'
  ).bind(d.id, d.affiliationNumber, d.displayName, d.isArchived ? 1 : 0).run()
  // Insert addresses
  if (d.addresses?.length) {
    const stmts = d.addresses.map((a: Record<string, unknown>) =>
      c.env.DB.prepare(
        'INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(a.id, d.id, a.label, a.street, a.postalCode, a.city, a.isDefault ? 1 : 0)
    )
    await c.env.DB.batch(stmts)
  }
  // Insert channels
  if (d.channels?.length) {
    const stmts = d.channels.map((ch: Record<string, unknown>, i: number) =>
      c.env.DB.prepare(
        'INSERT INTO club_channels (id, club_id, type, link, display_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(ch.id, d.id, ch.type, ch.link, ch.displayName ?? null, (ch.sortOrder as number | undefined) ?? i)
    )
    await c.env.DB.batch(stmts)
  }
  return c.json({ ok: true })
})

app.patch('/clubs/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('affiliationNumber' in p) { s.push('affiliation_number = ?'); v.push(p.affiliationNumber) }
  if ('displayName' in p) { s.push('display_name = ?'); v.push(p.displayName) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE clubs SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// Only ever called on a club the admin has confirmed has no teams/players
// left (checked client-side, #247 follow-up) — no cascade needed here.
app.delete('/clubs/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  await db.batch([
    db.prepare('DELETE FROM club_addresses WHERE club_id = ?').bind(id),
    db.prepare('DELETE FROM club_channels WHERE club_id = ?').bind(id),
    db.prepare('DELETE FROM club_logos WHERE club_id = ?').bind(id),
    db.prepare('DELETE FROM clubs WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// --- Club Addresses ---
app.post('/clubs/:clubId/addresses', async (c) => {
  const clubId = c.req.param('clubId')
  const d = await c.req.json()
  if (d.isDefault) {
    await c.env.DB.prepare('UPDATE club_addresses SET is_default = 0 WHERE club_id = ?').bind(clubId).run()
  }
  await c.env.DB.prepare(
    'INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(d.id, clubId, d.label, d.street, d.postalCode, d.city, d.isDefault ? 1 : 0).run()
  return c.json({ ok: true })
})

app.patch('/clubs/:clubId/addresses/:addressId', async (c) => {
  const clubId = c.req.param('clubId')
  const addressId = c.req.param('addressId')
  const p = await c.req.json()
  if (p.isDefault) {
    await c.env.DB.prepare('UPDATE club_addresses SET is_default = 0 WHERE club_id = ?').bind(clubId).run()
  }
  const s: string[] = [], v: unknown[] = []
  if ('label' in p) { s.push('label = ?'); v.push(p.label) }
  if ('street' in p) { s.push('street = ?'); v.push(p.street) }
  if ('postalCode' in p) { s.push('postal_code = ?'); v.push(p.postalCode) }
  if ('city' in p) { s.push('city = ?'); v.push(p.city) }
  if ('isDefault' in p) { s.push('is_default = ?'); v.push(p.isDefault ? 1 : 0) }
  if (s.length) { v.push(addressId); await c.env.DB.prepare(`UPDATE club_addresses SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

app.delete('/clubs/:clubId/addresses/:addressId', async (c) => {
  const clubId = c.req.param('clubId')
  const addressId = c.req.param('addressId')
  const row = await c.env.DB.prepare('SELECT is_default FROM club_addresses WHERE id = ?').bind(addressId).first()
  await c.env.DB.prepare('DELETE FROM club_addresses WHERE id = ?').bind(addressId).run()
  if (row && bool(row.is_default)) {
    await c.env.DB.prepare(
      'UPDATE club_addresses SET is_default = 1 WHERE club_id = ? AND id != ? LIMIT 1'
    ).bind(clubId, addressId).run()
  }
  return c.json({ ok: true })
})

// --- Club Communication Channels (#135) ---
app.post('/clubs/:clubId/channels', async (c) => {
  const clubId = c.req.param('clubId')
  const d = await c.req.json()
  // New channels go to the end of the list.
  const row = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM club_channels WHERE club_id = ?')
    .bind(clubId).first() as { m: number } | null
  const sortOrder = (row?.m ?? -1) + 1
  await c.env.DB.prepare(
    'INSERT INTO club_channels (id, club_id, type, link, display_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(d.id, clubId, d.type, d.link, d.displayName ?? null, sortOrder).run()
  return c.json({ ok: true, sortOrder })
})

app.patch('/clubs/:clubId/channels/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('type' in p) { s.push('type = ?'); v.push(p.type) }
  if ('link' in p) { s.push('link = ?'); v.push(p.link) }
  if ('displayName' in p) { s.push('display_name = ?'); v.push(p.displayName || null) }
  if ('sortOrder' in p) { s.push('sort_order = ?'); v.push(p.sortOrder) }
  if (s.length) { v.push(channelId); await c.env.DB.prepare(`UPDATE club_channels SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

app.delete('/clubs/:clubId/channels/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  await c.env.DB.prepare('DELETE FROM club_channels WHERE id = ?').bind(channelId).run()
  return c.json({ ok: true })
})

// Reorder: body { ids: string[] } — sort_order becomes each id's index.
app.put('/clubs/:clubId/channels/reorder', async (c) => {
  const clubId = c.req.param('clubId')
  const { ids } = await c.req.json() as { ids?: string[] }
  if (ids?.length) {
    const stmts = ids.map((id, i) =>
      c.env.DB.prepare('UPDATE club_channels SET sort_order = ? WHERE id = ? AND club_id = ?').bind(i, id, clubId)
    )
    await c.env.DB.batch(stmts)
  }
  return c.json({ ok: true })
})

// --- Club logos (#135) ---
// Mirrors player avatars: stored base64 in D1, served here so the bulk /api/data
// payload stays light (it only carries logoUpdatedAt for cache-busting).
app.get('/clubs/:id/logo', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB
    .prepare('SELECT data, content_type, updated_at FROM club_logos WHERE club_id = ?')
    .bind(id)
    .first() as { data: string; content_type: string; updated_at: string } | null
  if (!row) return c.json({ error: 'not_found' }, 404)
  const bytes = Uint8Array.from(atob(row.data), (ch) => ch.charCodeAt(0))
  return new Response(bytes, {
    headers: {
      'Content-Type': row.content_type,
      // The client appends ?v=<updatedAt>, so each version has a unique URL.
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: `"${row.updated_at}"`,
    },
  })
})

app.put('/clubs/:id/logo', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json() as { data?: string; contentType?: string }
  if (!body.data) return c.json({ error: 'missing data' }, 400)
  const updatedAt = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO club_logos (club_id, data, content_type, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(club_id) DO UPDATE SET
       data = excluded.data, content_type = excluded.content_type, updated_at = excluded.updated_at`
  ).bind(id, body.data, body.contentType ?? 'image/png', updatedAt).run()
  return c.json({ ok: true, logoUpdatedAt: updatedAt })
})

app.delete('/clubs/:id/logo', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM club_logos WHERE club_id = ?').bind(id).run()
  return c.json({ ok: true })
})

// --- Groups ---
app.post('/groups', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO groups_tbl (id, division_id, number, team_ids, is_archived) VALUES (?, ?, ?, ?, ?)'
  ).bind(d.id, d.divisionId, d.number, jsonStr(d.teamIds ?? []), d.isArchived ? 1 : 0).run()
  return c.json({ ok: true })
})

app.patch('/groups/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('divisionId' in p) { s.push('division_id = ?'); v.push(p.divisionId) }
  if ('number' in p) { s.push('number = ?'); v.push(p.number) }
  if ('teamIds' in p) { s.push('team_ids = ?'); v.push(jsonStr(p.teamIds)) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE groups_tbl SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// Delete group (archived only) — cascades: teams, match days → games → availabilities → selections
app.delete('/groups/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Delete teams in this group (and their game cascades)
  const teamsR = await db.prepare('SELECT id FROM teams WHERE group_id = ?').bind(id).all()
  for (const t of teamsR.results) {
    const tid = t.id as string
    const gamesR = await db.prepare('SELECT id FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(tid, tid).all()
    for (const g of gamesR.results) {
      await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(g.id).run()
      await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(g.id).run()
    }
    await db.prepare('DELETE FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(tid, tid).run()
  }
  await db.prepare('DELETE FROM teams WHERE group_id = ?').bind(id).run()
  // Delete match days in this group and their games/availabilities/selections
  const matchDaysR = await db.prepare('SELECT id FROM match_days WHERE group_id = ?').bind(id).all()
  for (const md of matchDaysR.results) {
    const mdGamesR = await db.prepare('SELECT id FROM games WHERE match_day_id = ?').bind(md.id).all()
    for (const g of mdGamesR.results) {
      await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(g.id).run()
      await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(g.id).run()
    }
    await db.prepare('DELETE FROM games WHERE match_day_id = ?').bind(md.id).run()
  }
  await db.prepare('DELETE FROM match_days WHERE group_id = ?').bind(id).run()
  await db.prepare('DELETE FROM groups_tbl WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// Reset (#270): delete every journée/match of a group — and their
// availabilities/selections — without touching the group or its teams.
// Mirrors the match-day cascade from the group delete above, minus the
// group/team removal.
app.delete('/groups/:id/games', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const matchDaysR = await db.prepare('SELECT id FROM match_days WHERE group_id = ?').bind(id).all()
  for (const md of matchDaysR.results) {
    const mdGamesR = await db.prepare('SELECT id FROM games WHERE match_day_id = ?').bind(md.id).all()
    for (const g of mdGamesR.results) {
      await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(g.id).run()
      await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(g.id).run()
    }
    await db.prepare('DELETE FROM games WHERE match_day_id = ?').bind(md.id).run()
  }
  await db.prepare('DELETE FROM match_days WHERE group_id = ?').bind(id).run()
  return c.json({ ok: true })
})

// --- Players ---
// Players are users with is_player = 1 (see #105). These routes manage that row.
app.post('/players', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, status, club_id)
     VALUES (?, ?, 'player', 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(d.id, d.email, d.firstName, d.lastName, d.licenseNumber, d.phone ?? '', d.birthDate ?? null, d.birthPlace ?? null, d.status, d.clubId).run()
  return c.json({ ok: true })
})

app.patch('/players/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('firstName' in p) { s.push('first_name = ?'); v.push(p.firstName) }
  if ('lastName' in p) { s.push('last_name = ?'); v.push(p.lastName) }
  if ('licenseNumber' in p) { s.push('license_number = ?'); v.push(p.licenseNumber) }
  if ('email' in p) { s.push('email = ?'); v.push(p.email) }
  if ('phone' in p) { s.push('phone = ?'); v.push(p.phone) }
  if ('birthDate' in p) { s.push('birth_date = ?'); v.push(p.birthDate ?? null) }
  if ('birthPlace' in p) { s.push('birth_place = ?'); v.push(p.birthPlace ?? null) }
  if ('status' in p) { s.push('status = ?'); v.push(p.status) }
  if ('clubId' in p) { s.push('club_id = ?'); v.push(p.clubId) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE users SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// --- Player avatars (#124) ---
// Images are stored base64 in D1 and served here so the bulk /api/data payload
// stays light (it only carries avatarUpdatedAt for cache-busting).
app.get('/players/:id/avatar', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB
    .prepare('SELECT data, content_type, updated_at FROM player_avatars WHERE user_id = ?')
    .bind(id)
    .first() as { data: string; content_type: string; updated_at: string } | null
  if (!row) return c.json({ error: 'not_found' }, 404)
  const bytes = Uint8Array.from(atob(row.data), (ch) => ch.charCodeAt(0))
  return new Response(bytes, {
    headers: {
      'Content-Type': row.content_type,
      // The client appends ?v=<updatedAt>, so each version has a unique URL and
      // can be cached aggressively.
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: `"${row.updated_at}"`,
    },
  })
})

app.put('/players/:id/avatar', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json() as { data?: string; contentType?: string }
  if (!body.data) return c.json({ error: 'missing data' }, 400)
  const updatedAt = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO player_avatars (user_id, data, content_type, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data = excluded.data, content_type = excluded.content_type, updated_at = excluded.updated_at`
  ).bind(id, body.data, body.contentType ?? 'image/jpeg', updatedAt).run()
  return c.json({ ok: true, avatarUpdatedAt: updatedAt })
})

app.delete('/players/:id/avatar', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM player_avatars WHERE user_id = ?').bind(id).run()
  return c.json({ ok: true })
})

// --- Teams ---
app.post('/teams', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO teams (id, club_id, phase_id, number, division_id, group_id, game_location_id, default_day, default_time, captain_id, player_ids, roster_initial_points, color, whatsapp_link, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    d.id, d.clubId, d.phaseId, d.number, d.divisionId, d.groupId,
    d.gameLocationId, d.defaultDay, d.defaultTime, d.captainId ?? '',
    jsonStr(d.playerIds ?? []), d.rosterInitialPoints ? jsonStr(d.rosterInitialPoints) : null,
    d.color ?? null, d.whatsappLink ?? null, d.isArchived ? 1 : 0,
  ).run()
  return c.json({ ok: true })
})

app.patch('/teams/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('clubId' in p) { s.push('club_id = ?'); v.push(p.clubId) }
  if ('phaseId' in p) { s.push('phase_id = ?'); v.push(p.phaseId) }
  if ('number' in p) { s.push('number = ?'); v.push(p.number) }
  if ('divisionId' in p) { s.push('division_id = ?'); v.push(p.divisionId) }
  if ('groupId' in p) { s.push('group_id = ?'); v.push(p.groupId) }
  if ('gameLocationId' in p) { s.push('game_location_id = ?'); v.push(p.gameLocationId) }
  if ('defaultDay' in p) { s.push('default_day = ?'); v.push(p.defaultDay) }
  if ('defaultTime' in p) { s.push('default_time = ?'); v.push(p.defaultTime) }
  if ('captainId' in p) { s.push('captain_id = ?'); v.push(p.captainId) }
  if ('playerIds' in p) { s.push('player_ids = ?'); v.push(jsonStr(p.playerIds)) }
  if ('rosterInitialPoints' in p) { s.push('roster_initial_points = ?'); v.push(p.rosterInitialPoints ? jsonStr(p.rosterInitialPoints) : null) }
  if ('color' in p) { s.push('color = ?'); v.push(p.color ?? null) }
  if ('whatsappLink' in p) { s.push('whatsapp_link = ?'); v.push(p.whatsappLink ?? null) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE teams SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// Delete team (archived only) — removes from group teamIds, cascades availabilities/selections
app.delete('/teams/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Remove team from group's team_ids
  const groupsR = await db.prepare('SELECT id, team_ids FROM groups_tbl').all()
  for (const g of groupsR.results) {
    const teamIds: string[] = jsonParse(g.team_ids) as string[]
    if (teamIds.includes(id)) {
      await db.prepare('UPDATE groups_tbl SET team_ids = ? WHERE id = ?')
        .bind(jsonStr(teamIds.filter(t => t !== id)), g.id).run()
    }
  }
  // Delete related game availabilities and selections for games involving this team
  const gamesR = await db.prepare('SELECT id FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(id, id).all()
  const gameIds = gamesR.results.map(r => r.id as string)
  if (gameIds.length > 0) {
    for (const gid of gameIds) {
      await db.prepare('DELETE FROM game_availabilities WHERE game_id = ?').bind(gid).run()
      await db.prepare('DELETE FROM game_selections WHERE game_id = ?').bind(gid).run()
    }
    await db.prepare('DELETE FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(id, id).run()
  }
  await db.prepare('DELETE FROM teams WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// Batch update teams (used for player conflict resolution)
app.post('/teams/batch', async (c) => {
  const { updates } = await c.req.json()
  if (!updates?.length) return c.json({ ok: true })
  const stmts = updates.map((u: { id: string; playerIds: string[]; rosterInitialPoints?: Record<string, string> }) =>
    c.env.DB.prepare('UPDATE teams SET player_ids = ?, roster_initial_points = ? WHERE id = ?')
      .bind(jsonStr(u.playerIds), u.rosterInitialPoints ? jsonStr(u.rosterInitialPoints) : null, u.id)
  )
  await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

// --- Match Days ---
app.post('/match-days', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO match_days (id, group_id, number, date) VALUES (?, ?, ?, ?)'
  ).bind(d.id, d.groupId, d.number, d.date).run()
  return c.json({ ok: true })
})

app.patch('/match-days/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('groupId' in p) { s.push('group_id = ?'); v.push(p.groupId) }
  if ('number' in p) { s.push('number = ?'); v.push(p.number) }
  if ('date' in p) { s.push('date = ?'); v.push(p.date) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE match_days SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// --- Games ---
app.post('/games', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time) VALUES (?, ?, ?, ?, ?)'
  ).bind(d.id, d.matchDayId, d.homeTeamId, d.awayTeamId, d.time ?? null).run()
  return c.json({ ok: true })
})

app.patch('/games/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('matchDayId' in p) { s.push('match_day_id = ?'); v.push(p.matchDayId) }
  if ('homeTeamId' in p) { s.push('home_team_id = ?'); v.push(p.homeTeamId) }
  if ('awayTeamId' in p) { s.push('away_team_id = ?'); v.push(p.awayTeamId) }
  if ('time' in p) { s.push('time = ?'); v.push(p.time ?? null) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE games SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// --- Game Availabilities ---
app.post('/game-availabilities/set', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO game_availabilities (id, game_id, player_id, status, overridden_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, overridden_by = excluded.overridden_by`
  ).bind(d.id, d.gameId, d.playerId, d.status, d.overriddenBy ?? null).run()
  return c.json({ ok: true })
})

app.post('/game-availabilities/clear', async (c) => {
  const { gameId, playerId } = await c.req.json()
  await c.env.DB.prepare(
    'DELETE FROM game_availabilities WHERE game_id = ? AND player_id = ?'
  ).bind(gameId, playerId).run()
  return c.json({ ok: true })
})

// --- Game Selections ---
app.post('/game-selections/set', async (c) => {
  const d = await c.req.json()
  if (!d.playerIds?.length) {
    await c.env.DB.prepare('DELETE FROM game_selections WHERE game_id = ? AND team_id = ?')
      .bind(d.gameId, d.teamId).run()
  } else {
    const existing = await c.env.DB.prepare('SELECT id FROM game_selections WHERE game_id = ? AND team_id = ?')
      .bind(d.gameId, d.teamId).first()
    if (existing) {
      await c.env.DB.prepare('UPDATE game_selections SET player_ids = ? WHERE id = ?')
        .bind(jsonStr(d.playerIds), existing.id).run()
    } else {
      await c.env.DB.prepare('INSERT INTO game_selections (id, game_id, team_id, player_ids) VALUES (?, ?, ?, ?)')
        .bind(d.id, d.gameId, d.teamId, jsonStr(d.playerIds)).run()
    }
  }
  return c.json({ ok: true })
})

app.post('/game-selections/batch', async (c) => {
  const { updates } = await c.req.json()
  for (const d of updates) {
    if (!d.playerIds?.length) {
      await c.env.DB.prepare('DELETE FROM game_selections WHERE game_id = ? AND team_id = ?')
        .bind(d.gameId, d.teamId).run()
    } else {
      const existing = await c.env.DB.prepare('SELECT id FROM game_selections WHERE game_id = ? AND team_id = ?')
        .bind(d.gameId, d.teamId).first()
      if (existing) {
        await c.env.DB.prepare('UPDATE game_selections SET player_ids = ? WHERE id = ?')
          .bind(jsonStr(d.playerIds), existing.id).run()
      } else {
        await c.env.DB.prepare('INSERT INTO game_selections (id, game_id, team_id, player_ids) VALUES (?, ?, ?, ?)')
          .bind(d.id, d.gameId, d.teamId, jsonStr(d.playerIds)).run()
      }
    }
  }
  return c.json({ ok: true })
})

export const onRequest = handle(app)
