import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { authApp, requestToken, userFromToken, type Env } from './auth'
import { needsSession } from './authGuard'
import { jsonParseCategories, jsonParseIds } from './rows'
import type { Address, ClubChannel, DataState } from '../../src/types'
import type {
  SeasonRow, PhaseRow, DivisionRow, ClubRow, ClubAddressRow, ClubChannelRow, GroupRow, TeamRow, PlayerPhasePointsRow, MatchDayRow, GameRow, GameAvailabilityRow, GameSelectionRow, UserRow,
  CompetitionRow, CompetitionEligibilityRow,
} from './rows'
import { PLAYER_CATEGORIES, type PlayerCategory } from '../../src/lib/playerCategories'
import { canClubAdd } from '../../src/lib/competitionEligibility'
import { seasonIdFromFftt, seasonIdFromName, seasonNameFromFftt } from '../../src/lib/season'
import { divisionDisplayName, ffttIdFromIri, orderDivisions, playersPerGameFor, PLAYERS_PER_GAME_DEFAULT, type FfttDivision } from '../../src/lib/ffttDivisions'
import { clubIdFromAffiliation, gameIdFor, homeGameDate, teamIdFor } from '../../src/lib/entityIds'
import { FFTT_PHASES, localPhaseId, phaseOrderKey } from '../../src/lib/ffttPhases'
import { type FfttClubTeam } from '../../src/lib/ffttTeams'
import { selectPoolForGroup, type FfttMatch, type FfttMatchTeam, type FfttPool } from '../../src/lib/ffttGames'
import {
  departingTeamIds, emptiedMatchDayIds, obsoleteGames, playingTeamIds,
  type ExistingGameRef, type SourceRound,
} from '../../src/lib/poolChanges'
import {
  canAddClubAdmin, canRemoveClubAdmin, refusalMessage,
  type AddRefusal, type RemoveRefusal,
} from '../../src/lib/clubAdmins'
import {
  isPlausibleEmail, isPlausibleLicenceNumber, isValidAffiliationNumber, REQUEST_REFUSAL_MESSAGES,
  type ClubAdminRequest, type ClubAdminRequestSnapshot, type ClubAdminRequestStatus,
} from '../../src/lib/clubAdminRequests'
import { sendEmails } from './email'
import {
  clubConfirmationEmail, decisionEmail, newRequestForAdminEmail, type RequestSummary,
} from './onboardingEmails'

// Exported for tests: the session guard is only observable through a real
// request, so the suites that pin it down fetch this app directly (#320, #138).
export const app = new Hono<Env>().basePath('/api')

// Opaque generated id (#278), same shape as the web app's nextId(). The
// counter keeps a single request that creates several rows from colliding on
// one Date.now().
let generatedIdCounter = 0
const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${generatedIdCounter++}-${Math.random().toString(36).slice(2, 7)}`

// Session guard (#98): every /api route except the public auth + image
// endpoints (see needsSession) requires a valid Bearer session. AUTH_GUARD_DISABLED
// bypasses it entirely — an escape hatch for a local database with no sessions
// to hand out, not a mode anything deployed should ever run in (#138).
app.use('*', async (c, next) => {
  if (c.env.AUTH_GUARD_DISABLED === 'true') return next()
  if (!needsSession(c.req.method, new URL(c.req.url).pathname)) return next()
  // Bearer (mobile) or the session cookie (web, #370).
  const token = requestToken(c.req)
  const user = token ? await userFromToken(c.env.DB, token) : null
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  return next()
})

// Authentication (email OTP + Google/Apple OAuth).
app.route('/auth', authApp)

// --- Helpers ---
const bool = (v: unknown) => v === 1 || v === true
const jsonStr = (v: unknown) => JSON.stringify(v)

/**
 * Whether `viewer` may be told when a given member last opened the app (#406).
 *
 * `GET /api/data` sends one payload to every client, so this is the only place
 * the restriction can live — a member's last visit is about them, not about the
 * club's sporting life, and it stays with the people who administer them:
 * a general admin sees everyone, a club admin sees their own club, and a player
 * sees nobody, themselves included.
 *
 * No viewer means AUTH_GUARD_DISABLED, the local-only escape hatch that already
 * serves this entire payload to an unauthenticated caller (#138). Withholding
 * one field there would hide the feature from local development and protect
 * nothing.
 */
function lastSeenVisibleTo(viewer: UserRow | undefined): (row: UserRow) => boolean {
  if (!viewer) return () => true
  if (viewer.role === 'general_admin') return () => true
  if (viewer.role === 'club_admin' && viewer.club_id) {
    const { club_id: adminClubId } = viewer
    return (row) => row.club_id === adminClubId
  }
  return () => false
}

/** The `lastSeenAt` field for a member row, or nothing at all. */
const lastSeenField = (r: UserRow, visible: (row: UserRow) => boolean) =>
  r.last_seen_at && visible(r) ? { lastSeenAt: new Date(r.last_seen_at).toISOString() } : {}

// --- GET /api/data — return all entities ---
app.get('/data', async (c) => {
  const db = c.env.DB
  const canSeeLastSeen = lastSeenVisibleTo(c.get('user'))
  const [
    seasonsR, phasesR, divisionsR, clubsR, addressesR, channelsR,
    groupsR, teamsR, phasePointsR, matchDaysR, gamesR,
    availsR, selectionsR, usersR, avatarsR, clubLogosR,
    competitionsR, eligibilitiesR,
  ] = await Promise.all([
    db.prepare('SELECT * FROM seasons').all<SeasonRow>(),
    db.prepare('SELECT * FROM phases').all<PhaseRow>(),
    db.prepare('SELECT * FROM divisions').all<DivisionRow>(),
    db.prepare('SELECT * FROM clubs').all<ClubRow>(),
    db.prepare('SELECT * FROM club_addresses').all<ClubAddressRow>(),
    db.prepare('SELECT * FROM club_channels ORDER BY sort_order').all<ClubChannelRow>(),
    db.prepare('SELECT * FROM groups').all<GroupRow>(),
    db.prepare('SELECT * FROM teams').all<TeamRow>(),
    db.prepare('SELECT * FROM player_phase_points').all<PlayerPhasePointsRow>(),
    db.prepare('SELECT * FROM match_days').all<MatchDayRow>(),
    db.prepare('SELECT * FROM games').all<GameRow>(),
    db.prepare('SELECT * FROM game_availabilities').all<GameAvailabilityRow>(),
    db.prepare('SELECT * FROM game_selections').all<GameSelectionRow>(),
    db.prepare('SELECT * FROM users').all<UserRow>(),
    // Only the version marker — the image bytes are served separately so this
    // bulk payload stays light.
    db.prepare('SELECT user_id, updated_at FROM user_avatars').all(),
    db.prepare('SELECT club_id, updated_at FROM club_logos').all(),
    db.prepare('SELECT * FROM competitions ORDER BY sort_order').all<CompetitionRow>(),
    db.prepare('SELECT * FROM club_competition_eligibility').all<CompetitionEligibilityRow>(),
  ])
  const avatarUpdatedAt = new Map(
    avatarsR.results.map((r) => [r.user_id as string, r.updated_at as string]),
  )
  const logoUpdatedAt = new Map(
    clubLogosR.results.map((r) => [r.club_id as string, r.updated_at as string]),
  )

  const addrByClub = new Map<string, Address[]>()
  for (const a of addressesR.results) {
    const cid = a.club_id
    if (!addrByClub.has(cid)) addrByClub.set(cid, [])
    addrByClub.get(cid)!.push({
      id: a.id, label: a.label, street: a.street,
      postalCode: a.postal_code, city: a.city, isDefault: bool(a.is_default),
    })
  }

  // Channels are pre-sorted by sort_order in the query above.
  const channelsByClub = new Map<string, ClubChannel[]>()
  for (const ch of channelsR.results) {
    const cid = ch.club_id
    if (!channelsByClub.has(cid)) channelsByClub.set(cid, [])
    channelsByClub.get(cid)!.push({
      id: ch.id, type: ch.type, link: ch.link, sortOrder: ch.sort_order,
      ...(ch.display_name ? { displayName: ch.display_name } : {}),
    })
  }

  // teams.division_id was dropped in 0031 (#282): the group is the single
  // source of truth for a team's division, and the stored copy had drifted on
  // 24 of 148 production rows. Still projected onto the Team payload so the UI
  // can read it directly — derived here, never stored.
  const divisionByGroup = new Map(groupsR.results.map(g => [g.id, g.division_id]))

  // Annotated with the shared contract (#285) so a field renamed or dropped
  // here fails the build instead of reaching the client as undefined.
  const payload: DataState = {
    seasons: seasonsR.results.map(r => ({
      id: r.id, displayName: r.display_name, status: r.status,
    })),
    phases: phasesR.results.map(r => ({
      id: r.id, seasonId: r.season_id, name: r.name, displayName: r.display_name,
      // There used to be a fallback here reading the pre-0012 is_active /
      // is_archived columns, on the grounds that PR previews shared the
      // production D1 and never ran migrations. Both halves are now false:
      // #296 gave previews their own migrated database, and 0012 dropped
      // those columns everywhere, so the fallback could only ever have
      // returned 'upcoming'. Typing the row (#285) is what surfaced it.
      status: r.status,
    })),
    divisions: divisionsR.results.map(r => ({
      id: r.id, phaseId: r.phase_id, displayName: r.display_name,
      rank: r.rank, playersPerGame: r.players_per_game,
      isArchived: bool(r.is_archived),
      ...(r.identifier ? { identifier: r.identifier } : {}),
      ...(r.parent_id ? { parentId: r.parent_id } : {}),
      ...(r.competition_id ? { competitionId: r.competition_id } : {}),
    })),
    // Pre-sorted by sort_order in the query above (#482).
    competitions: competitionsR.results.map(r => ({
      id: r.id, displayName: r.display_name,
      categories: jsonParseCategories(r.categories),
      isCategoryLocked: bool(r.is_category_locked),
      sortOrder: r.sort_order, isArchived: bool(r.is_archived),
    })),
    // (club_id, competition_id, player_id) is the primary key — no surrogate id.
    competitionEligibilities: eligibilitiesR.results.map(r => ({
      clubId: r.club_id, competitionId: r.competition_id,
      playerId: r.player_id, effect: r.effect,
    })),
    clubs: clubsR.results.map(r => ({
      id: r.id, affiliationNumber: r.affiliation_number ?? '', displayName: r.display_name,
      isArchived: bool(r.is_archived),
      addresses: addrByClub.get(r.id) ?? [],
      channels: channelsByClub.get(r.id) ?? [],
      ...(logoUpdatedAt.has(r.id)
        ? { logoUpdatedAt: logoUpdatedAt.get(r.id) }
        : {}),
    })),
    groups: groupsR.results.map(r => ({
      id: r.id, divisionId: r.division_id, number: r.number, teamIds: jsonParseIds(r.team_ids),
      isArchived: bool(r.is_archived),
      ...(r.group_id ? { groupId: r.group_id } : {}),
    })),
    // Players are the projection of users where is_player = 1.
    players: usersR.results.filter(r => bool(r.is_player)).map(r => ({
      id: r.id, firstName: r.first_name ?? '', lastName: r.last_name ?? '',
      licenseNumber: r.license_number ?? '', phone: r.phone,
      ...(r.email ? { email: r.email } : {}),
      ...(r.birth_date ? { birthDate: r.birth_date } : {}),
      ...(r.birth_place ? { birthPlace: r.birth_place } : {}),
      ...(r.category ? { category: r.category } : {}),
      status: r.status, clubId: r.club_id ?? '',
      ...lastSeenField(r, canSeeLastSeen),
      ...(avatarUpdatedAt.has(r.id as string)
        ? { avatarUpdatedAt: avatarUpdatedAt.get(r.id as string) }
        : {}),
    })),
    teams: teamsR.results.map(r => ({
      id: r.id, clubId: r.club_id, phaseId: r.phase_id, number: r.number,
      divisionId: divisionByGroup.get(r.group_id as string) ?? '',
      groupId: r.group_id, gameLocationId: r.game_location_id,
      defaultDay: r.default_day, defaultTime: r.default_time, captainId: r.captain_id,
      isArchived: bool(r.is_archived),
      ...(r.team_id ? { teamId: r.team_id } : {}),
      playerIds: jsonParseIds(r.player_ids),
      ...(r.color ? { color: r.color } : {}),
      ...(r.whatsapp_link ? { whatsappLink: r.whatsapp_link } : {}),
    })),
    // (phase_id, player_id) is the primary key (#384) — no surrogate id.
    playerPhasePoints: phasePointsR.results.map(r => ({
      phaseId: r.phase_id, playerId: r.player_id, points: r.points,
    })),
    matchDays: matchDaysR.results.map(r => ({
      id: r.id, groupId: r.group_id, number: r.number, date: r.date,
    })),
    games: gamesR.results.map(r => ({
      id: r.id, matchDayId: r.match_day_id, homeTeamId: r.home_team_id,
      awayTeamId: r.away_team_id, ...(r.time ? { time: r.time } : {}),
      // #292: this was missing. Games have owned their date since #271, but
      // the payload never carried it, so every client-side game.date was
      // undefined and the UI silently fell back to match_days.date — the MIN
      // across the journée. A Sunday fixture in a mostly-Saturday round showed
      // the Saturday.
      ...(r.date ? { date: r.date } : {}),
      ...(r.game_id ? { gameId: r.game_id } : {}),
      ...(r.source ? { source: r.source } : {}),
    })),
    // (game_id, player_id) is the primary key since 0033 (#282) — no surrogate id.
    gameAvailabilities: availsR.results.map(r => ({
      gameId: r.game_id, playerId: r.player_id, status: r.status,
      ...(r.overridden_by ? { overriddenBy: r.overridden_by } : {}),
    })),
    gameSelections: selectionsR.results.map(r => ({
      gameId: r.game_id, teamId: r.team_id, playerIds: jsonParseIds(r.player_ids),
    })),
    users: usersR.results.map(r => ({
      id: r.id, role: r.role, isPlayer: bool(r.is_player),
      ...(r.email ? { email: r.email } : {}),
      ...(r.first_name ? { firstName: r.first_name } : {}),
      ...(r.last_name ? { lastName: r.last_name } : {}),
      ...(r.license_number ? { licenseNumber: r.license_number } : {}),
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.birth_date ? { birthDate: r.birth_date } : {}),
      ...(r.birth_place ? { birthPlace: r.birth_place } : {}),
      ...(r.category ? { category: r.category } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.club_id ? { clubId: r.club_id } : {}),
      ...lastSeenField(r, canSeeLastSeen),
    })),
  }
  return c.json(payload)
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
      id: d.id, identifier: d.identifier, name: divisionDisplayName(d.name), rank: i + 1,
      playersPerGame: playersPerGameFor(d.identifier),
      exists: existing.ids.has(d.id) || existing.names.has(divisionDisplayName(d.name).toLowerCase()),
    })),
  })
})

type ImportedPhase = { id: string; seasonId: unknown; name: unknown; displayName: unknown; status: unknown }
type ImportedDivision = {
  id: string; phaseId: string; displayName: string; rank: number; playersPerGame: number; isArchived: boolean
  /** FFTT identifier, e.g. "GE3P1" (#275) — persisted so playersPerGameFor() can be re-derived. Absent for divisions created from a payload that has none. */
  identifier?: string
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
    const displayName = divisionDisplayName(d.name)
    if (existing.ids.has(d.id) || existing.names.has(displayName.toLowerCase())) {
      skipped.push({ id: d.id, name: displayName })
      continue
    }
    rank += 1
    created.push({
      id: d.id, phaseId, displayName, rank,
      playersPerGame: playersPerGameFor(d.identifier), isArchived: false,
      identifier: d.identifier,
      ...(d.parentId ? { parentId: d.parentId } : {}),
    })
  }
  if (created.length) {
    await db.batch(created.map((d) =>
      db.prepare('INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
        .bind(d.id, d.phaseId, d.displayName, d.rank, d.playersPerGame, d.parentId ?? null, d.identifier),
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
        ? divisionDisplayName(x.divisionName.trim().slice(0, 80)) : `Division ${x.divisionId}`,
      divisionIdentifier: typeof x.divisionIdentifier === 'string'
        ? x.divisionIdentifier.trim().slice(0, 20) : '',
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
  const r = await db.prepare('SELECT id, phase_id, number, group_id, team_id FROM teams WHERE club_id = ?')
    .bind(clubId).all()
  const rows = r.results.map((t) => ({
    id: t.id as string, phaseId: t.phase_id as string, number: t.number as number,
    groupId: (t.group_id as string | null) ?? '', ffttId: (t.team_id as string | null) ?? null,
  }))
  return {
    ids: new Set(rows.map((t) => t.id)),
    byPhaseNumber: new Set(rows.map((t) => `${t.phaseId}|${t.number}`)),
    /**
     * The local row behind an FFTT engagement (#422): by FFTT team id, else by
     * (phase, number) — the same two keys the skip check uses, but returning
     * the team rather than a yes/no, so an engagement that moved pool can be
     * moved instead of reported as already there. Phase-scoped: a move only
     * means anything within one.
     */
    find(ffttId: string, phaseId: string, number: number) {
      return rows.find((t) => t.phaseId === phaseId && (t.ffttId === ffttId || t.id === ffttId))
        ?? rows.find((t) => t.phaseId === phaseId && t.number === number)
        ?? null
    },
    /** A team this run just created, so a payload listing it twice still
     *  matches instead of inserting it again. */
    register(row: { id: string; phaseId: string; number: number; groupId: string; ffttId: string | null }) {
      rows.push(row)
    },
  }
}

/**
 * The local group an FFTT engagement belongs in: the one carrying its pool id,
 * else the one numbered like it in the same division (#278). Null when neither
 * exists yet — the import creates it.
 */
function localGroupForPool<T extends { divisionId: string; number: number; groupId?: string }>(
  groups: T[], pool: { divisionId: string; poolId: string; poolNumber: number | null },
): T | null {
  return groups.find((g) => g.groupId === pool.poolId)
    ?? (pool.poolNumber !== null
      ? groups.find((g) => g.divisionId === pool.divisionId && g.number === pool.poolNumber) ?? null
      : null)
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
  const groupRows = await c.env.DB.prepare('SELECT id, division_id, number, group_id FROM groups').all()
  const groups = groupRows.results.map((g) => ({
    id: g.id as string, divisionId: g.division_id as string, number: g.number as number,
    groupId: (g.group_id as string | null) ?? undefined,
  }))
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const existing = await clubTeamKeys(c.env.DB, clubId)

  return c.json({
    club: { id: ctx.club.id, displayName: ctx.club.display_name },
    season: ctx.season,
    teams: ctx.teams.map((t) => {
      const division = divisionById.get(t.divisionId)
      const exists = existing.ids.has(t.id) ||
        (!!division && existing.byPhaseNumber.has(`${division.phase_id}|${t.number}`))
      // Already here, but FFTT now engages it in another poule (#422): the
      // repêchage case. Reported as a move rather than as "déjà présente",
      // which is what made a mid-season change impossible to follow.
      const local = division
        ? existing.find(t.id, division.phase_id as string, t.number) : null
      const target = localGroupForPool(groups, t)
      const from = local ? groupById.get(local.groupId) : undefined
      const moved = !!local && (!target || target.id !== local.groupId)
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
        /** Engaged elsewhere than where it sits locally — an import moves it. */
        moved,
        /** The poule it currently sits in, when it moves. */
        fromPoolNumber: moved && from ? from.number : null,
        fromDivisionName: moved && from
          ? (divisionById.get(from.divisionId)?.display_name as string | undefined) ?? null
          : null,
        // Importable = not already there (or there but in another poule), and
        // the division is known or can be auto-imported (needs a detectable
        // phase and an existing season).
        importable: (!exists || moved) && ctx.season.exists && (!!division || t.phase !== null),
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
    // The payload now carries the division identifier (e.g. "GE7P1", #275),
    // so the known players-per-game overrides apply here too; older clients
    // that omit it still fall back to the default, adjustable on /divisions.
    // parentId (#236) is the FFTT id of a division that may not exist locally
    // yet (e.g. a lower pool imported before its parent) — same caveat as the
    // dedicated divisions import; the lock simply has no effect until it does.
    const playersPerGame = t.divisionIdentifier
      ? playersPerGameFor(t.divisionIdentifier) : PLAYERS_PER_GAME_DEFAULT
    await db.prepare('INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
      .bind(t.divisionId, phaseRow.id, t.divisionName, rank, playersPerGame, t.divisionParentId, t.divisionIdentifier || null).run()
    const division = {
      id: t.divisionId, phaseId: phaseRow.id as string, displayName: t.divisionName,
      rank, playersPerGame, isArchived: false,
      ...(t.divisionIdentifier ? { identifier: t.divisionIdentifier } : {}),
      ...(t.divisionParentId ? { parentId: t.divisionParentId } : {}),
    }
    createdDivisions.push(division)
    divisionById.set(t.divisionId, { id: t.divisionId, phase_id: phaseRow.id })
  }

  const groupRows = await db.prepare('SELECT id, division_id, number, team_ids, is_archived, group_id FROM groups').all()
  const groups = groupRows.results.map((g) => ({
    id: g.id as string, divisionId: g.division_id as string, number: g.number as number,
    teamIds: jsonParseIds(g.team_ids), isArchived: bool(g.is_archived),
    groupId: (g.group_id as string | null) ?? undefined,
  }))
  const existing = await clubTeamKeys(db, clubId)

  const createdGroups: typeof groups = []
  const touchedGroups = new Map<string, (typeof groups)[number]>()
  /** Existing groups that just learned their FFTT pool id (#278). */
  const adoptedPoolIds = new Map<string, string>()
  const createdTeams: Array<Record<string, unknown>> = []
  /** Teams already here, engaged in another poule than the one they sit in (#422). */
  const movedTeams: Array<{ id: string; groupId: string; previousGroupId: string; ffttId: string }> = []
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
    const local = existing.find(t.id, phaseId, t.number)

    // The pool FFTT engages it in, when we already know it: by FFTT pool id or
    // by (division, number) (#278). Looked up before the existence check — a
    // team already here needs it just as much, to tell whether it still sits
    // where FFTT says it plays (#422). Creating the pool comes later, once
    // this team is known to be processed: a team skipped below must not leave
    // an empty group behind.
    let group = localGroupForPool(groups, t) ?? undefined
    if (local && group && local.groupId === group.id) {
      skipped.push({ id: t.id, label: t.label, reason: 'already_exists' })
      continue
    }
    if (!local && !validLocationIds.has(override.gameLocationId)) {
      skipped.push({ id: t.id, label: t.label, reason: 'invalid_location' })
      continue
    }
    if (!group) {
      // The local id is generated and the FFTT pool id is kept in its own
      // column (#278) — the two used to be the same value, which left groups
      // created by hand or from a PDF in a different id space.
      group = {
        id: newId('group'), divisionId: t.divisionId, number: t.poolNumber ?? 1,
        teamIds: [], isArchived: false, groupId: t.poolId,
      }
      groups.push(group)
      createdGroups.push(group)
    }
    // An existing group matched by (division, number) may predate the FFTT
    // import and carry no pool id yet — adopt the one FFTT just gave us.
    if (!group.groupId) {
      group.groupId = t.poolId
      adoptedPoolIds.set(group.id, t.poolId)
    }

    if (local) {
      // Moved, not created (#422): venue, day, time, roster and captain are
      // the club's own settings and stay exactly as they are — the overrides
      // in the payload are ignored. Only where the team plays changes.
      movedTeams.push({ id: local.id, groupId: group.id, previousGroupId: local.groupId, ffttId: t.id })
      group.teamIds = [...group.teamIds, local.id]
      touchedGroups.set(group.id, group)
      const from = groups.find((g) => g.id === local.groupId)
      if (from) {
        from.teamIds = from.teamIds.filter((id) => id !== local.id)
        touchedGroups.set(from.id, from)
      }
      local.groupId = group.id
      continue
    }

    // Local id derived from (club, phase, number) (#282); the FFTT team id is
    // kept in its own column so a re-import matches instead of duplicating.
    const team = {
      id: teamIdFor(clubId, phaseId, t.number), teamId: t.id, clubId, phaseId, number: t.number,
      divisionId: t.divisionId, groupId: group.id, gameLocationId: override.gameLocationId,
      defaultDay: override.defaultDay, defaultTime: override.defaultTime,
      captainId: '', playerIds: [] as string[], isArchived: false,
    }
    group.teamIds = [...group.teamIds, team.id]
    touchedGroups.set(group.id, group)
    createdTeams.push(team)
    existing.ids.add(t.id)
    existing.byPhaseNumber.add(`${phaseId}|${t.number}`)
    existing.register({ id: team.id, phaseId, number: t.number, groupId: group.id, ffttId: t.id })
  }

  const stmts = [
    ...createdGroups.map((g) =>
      db.prepare('INSERT INTO groups (id, division_id, number, team_ids, is_archived, group_id) VALUES (?, ?, ?, ?, 0, ?)')
        .bind(g.id, g.divisionId, g.number, jsonStr(g.teamIds), g.groupId ?? null)),
    ...[...adoptedPoolIds].map(([id, poolId]) =>
      db.prepare('UPDATE groups SET group_id = ? WHERE id = ?').bind(poolId, id)),
    ...[...touchedGroups.values()].filter((g) => !createdGroups.includes(g)).map((g) =>
      db.prepare('UPDATE groups SET team_ids = ? WHERE id = ?').bind(jsonStr(g.teamIds), g.id)),
    ...createdTeams.map((t) =>
      db.prepare(
        `INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, is_archived, team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '[]', 0, ?)`,
      ).bind(t.id, t.clubId, t.phaseId, t.number, t.groupId, t.gameLocationId, t.defaultDay, t.defaultTime, t.teamId ?? null)),
    ...movedTeams.map((t) =>
      db.prepare('UPDATE teams SET group_id = ? WHERE id = ?').bind(t.groupId, t.id)),
    // A team that predates the FFTT import — created by hand or from a PDF —
    // carries no FFTT id; the engagement we just read gives it one.
    ...movedTeams.map((t) =>
      db.prepare('UPDATE teams SET team_id = ? WHERE id = ? AND team_id IS NULL').bind(t.ffttId, t.id)),
  ]
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))

  // Their fixtures in the poule they left go with them (#422) — after the
  // batch, so the pool they join exists before anything is cleaned up.
  const deletedGames: string[] = []
  const deletedMatchDays: string[] = []
  for (const t of movedTeams) {
    const cleared = await clearTeamGamesOutsideGroup(db, t.id, t.previousGroupId, t.groupId)
    deletedGames.push(...cleared.deletedGames)
    deletedMatchDays.push(...cleared.deletedMatchDays)
  }

  return c.json({
    createdPhases,
    createdDivisions,
    // Created + updated groups, in their final state, for client-side upsert.
    groups: [...touchedGroups.values()],
    createdTeams,
    /** Teams FFTT now engages in another poule, moved rather than skipped (#422). */
    movedTeams: movedTeams.map((t) => ({ id: t.id, groupId: t.groupId, previousGroupId: t.previousGroupId })),
    /** Fixtures of the poule they left, removed with them. */
    deletedGames,
    deletedMatchDays,
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
      /** FFTT pool ids already present locally (groups.group_id), not local group ids (#278). */
      existingIds: Set<string>
      existingNumbers: Set<number>
    }

async function groupsImportContext(db: Env['Bindings']['DB'], divisionId: string, poolsRaw: unknown): Promise<GroupsImportContext> {
  const division = await db.prepare('SELECT id, display_name FROM divisions WHERE id = ?').bind(divisionId).first()
  if (!division) return { error: 'division_not_found' }
  const existingRows = await db.prepare('SELECT id, number, group_id FROM groups WHERE division_id = ?').bind(divisionId).all()
  return {
    division: { id: division.id as string, displayName: division.display_name as string },
    pools: parsePoolsList(poolsRaw),
    existingIds: new Set(existingRows.results.flatMap((g) => g.group_id ? [g.group_id as string] : [])),
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

  const created: Array<{ id: string; divisionId: string; number: number; teamIds: string[]; isArchived: boolean; groupId: string }> = []
  const skipped: Array<{ id: string; number: number | null }> = []
  for (const p of ctx.pools) {
    if (ctx.existingIds.has(p.id) || (p.number !== null && ctx.existingNumbers.has(p.number))) {
      skipped.push({ id: p.id, number: p.number })
      continue
    }
    const number = p.number ?? 1
    // Local id generated, FFTT pool id stored alongside it (#278).
    created.push({ id: newId('group'), divisionId, number, teamIds: [], isArchived: false, groupId: p.id })
    ctx.existingIds.add(p.id)
    ctx.existingNumbers.add(number)
  }
  if (created.length) {
    await c.env.DB.batch(created.map((g) =>
      c.env.DB.prepare('INSERT INTO groups (id, division_id, number, team_ids, is_archived, group_id) VALUES (?, ?, ?, ?, 0, ?)')
        .bind(g.id, g.divisionId, g.number, jsonStr(g.teamIds), g.groupId)))
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
async function gamesImportContext(
  db: Env['Bindings']['DB'], groupIds: string[], poolsRaw: unknown,
  /** When set, keep only the fixtures this team plays (#287). */
  onlyTeamId: string | null = null,
): Promise<GamesGroupContext[]> {
  const groupRows = await db.prepare('SELECT id, division_id, number, team_ids FROM groups').all()
  const groupById = new Map(groupRows.results.map((g) => [g.id as string, g]))
  const divisionRows = await db.prepare('SELECT id, display_name, phase_id FROM divisions').all()
  const divisionById = new Map(divisionRows.results.map((d) => [d.id as string, d]))
  const poolsByDivision = parsePoolsPayload(poolsRaw)

  // A team-scoped import matches FFTT sides by the team's FFTT id when it has
  // one, and by (club affiliation, number) otherwise — the same two keys the
  // resolver uses, so a team created by the PDF import is still recognised.
  let onlyTeam: { ffttId: string | null; affiliation: string | null; number: number | null } | null = null
  if (onlyTeamId) {
    const row = await db.prepare(
      `SELECT t.team_id, t.number, c.affiliation_number
       FROM teams t LEFT JOIN clubs c ON c.id = t.club_id WHERE t.id = ?`,
    ).bind(onlyTeamId).first() as { team_id: string | null; number: number | null; affiliation_number: string | null } | null
    if (row) {
      onlyTeam = {
        ffttId: row.team_id, affiliation: row.affiliation_number,
        number: row.number,
      }
    }
  }
  const playedByOnlyTeam = (side: FfttMatchTeam) => {
    if (!onlyTeam) return true
    if (onlyTeam.ffttId && side.teamId === onlyTeam.ffttId) return true
    return !!onlyTeam.affiliation
      && side.clubIdentifier === onlyTeam.affiliation
      && side.teamNumber === onlyTeam.number
  }

  return groupIds.map((groupId): GamesGroupContext => {
    const g = groupById.get(groupId)
    if (!g) return { groupId, error: 'group_not_found' }
    const division = divisionById.get(g.division_id as string)
    if (!division) return { groupId, error: 'group_not_found' }
    const group = {
      id: groupId, divisionId: g.division_id as string, number: g.number as number,
      teamIds: jsonParseIds(g.team_ids),
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
    const matches = onlyTeam
      ? pool.matches.filter((m) => playedByOnlyTeam(m.home) || playedByOnlyTeam(m.away))
      : pool.matches
    return { ...identity, matches }
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
  // Each team's playing day, so the games import can put a home fixture on it (#287).
  const defaultDayById = new Map(teamRows.map((t) => [t.id as string, (t.default_day as string | null) ?? '']))
  return {
    clubByAffiliation,
    teamIds,
    /** The team's default playing day, '' when unknown or newly created without one. */
    defaultDayOf(teamId: string): string {
      return defaultDayById.get(teamId) ?? ''
    },
    resolve(side: FfttMatchTeam, phaseId: string): string | null {
      const byId = teamByIdPhase.get(`${side.teamId}|${phaseId}`)
      if (byId) return byId
      // Second lookup key: the club id derived from the affiliation number
      // (#275). Going through clubByAffiliation alone is not enough — a club
      // whose affiliation_number is NULL is simply absent from that map, the
      // (club, number, phase) fallback below is skipped, and the caller
      // creates a team that already exists under another id space. That is
      // what produced the duplicate phase-27-1 teams in production: the
      // schedule-document import keys teams on doc-<affiliation>-<number>
      // while the games import uses the real FFTT team id, and only this
      // fallback can tell that they are the same team. Club ids are
      // deterministic (clubIdFor / clubIdFromAffiliation), so deriving the id
      // is safe: it resolves to nothing when no such club exists.
      const clubId = side.clubIdentifier
        ? clubByAffiliation.get(side.clubIdentifier) ?? clubIdFromAffiliation(side.clubIdentifier) ?? undefined
        : undefined
      if (clubId && side.teamNumber !== null) {
        return teamByClubNumberPhase.get(`${clubId}|${side.teamNumber}|${phaseId}`) ?? null
      }
      return null
    },
    register(teamId: string, clubId: string, number: number, phaseId: string, ffttTeamId: string, defaultDay = '') {
      teamIds.add(teamId)
      defaultDayById.set(teamId, defaultDay)
      teamByIdPhase.set(`${ffttTeamId}|${phaseId}`, teamId)
      teamByClubNumberPhase.set(`${clubId}|${number}|${phaseId}`, teamId)
    },
  }
}

const parseGroupIds = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 100) : []

/**
 * The FFTT matches of one group as poolChanges reads them (#422): resolved to
 * local team ids and grouped by the journée they land on.
 *
 * A side that resolves to nothing gets a placeholder id instead of marking the
 * round incomplete. Resolution failure means something precise here — no such
 * team exists locally yet, so no local game can reference it — unlike the
 * document import, where an unreadable roster name says nothing about whether
 * the team is known. Marking these rounds incomplete would switch the whole
 * comparison off in exactly the case it exists for: a poule whose new
 * opponents are, by definition, not local teams yet.
 */
function ffttSourceRounds(
  matches: FfttMatch[],
  resolve: (side: FfttMatchTeam) => string | null,
  matchDayIdOf: (round: number) => string | undefined,
): SourceRound[] {
  const placeholder = (side: FfttMatchTeam) => `fftt:${side.teamId}`
  const byRound = new Map<number, SourceRound>()
  for (const m of matches) {
    let round = byRound.get(m.round)
    if (!round) {
      // '' when the journée doesn't exist locally yet: it holds no game, so it
      // can hold no obsolete one — but its pairings still count as "playing".
      round = { matchDayId: matchDayIdOf(m.round) ?? '', pairings: [] }
      byRound.set(m.round, round)
    }
    round.pairings.push({
      homeTeamId: resolve(m.home) ?? placeholder(m.home),
      awayTeamId: resolve(m.away) ?? placeholder(m.away),
    })
  }
  return [...byRound.values()]
}

/** Local games grouped by the group their journée belongs to (#422). */
function gamesByGroupId(
  mdRows: Array<Record<string, unknown>>, gameRows: Array<Record<string, unknown>>,
): Map<string, ExistingGameRef[]> {
  const groupIdByMatchDay = new Map(mdRows.map((m) => [m.id as string, m.group_id as string]))
  const byGroup = new Map<string, ExistingGameRef[]>()
  for (const g of gameRows) {
    const groupId = groupIdByMatchDay.get(g.match_day_id as string)
    if (!groupId) continue
    const list = byGroup.get(groupId) ?? []
    list.push({
      id: g.id as string, matchDayId: g.match_day_id as string,
      homeTeamId: g.home_team_id as string, awayTeamId: g.away_team_id as string,
      source: (g.source as string | null) ?? null,
    })
    byGroup.set(groupId, list)
  }
  return byGroup
}

// Games own their date (#271); match_days.date is now derived — the MIN of
// its games' dates, recomputed whenever games under it change. Guarded by
// the EXISTS check so a match_day with zero dated games (a freshly-created
// empty shell, or one whose games were all created without a date) is left
// alone and keeps whatever date it was given directly. One shared statement
// reused by every write path (bulk imports fold it into their own
// db.batch(); single-row endpoints call recomputeMatchDayDate directly).
function matchDayDateRecomputeStmt(db: Env['Bindings']['DB'], matchDayId: string) {
  return db.prepare(
    `UPDATE match_days SET date = (SELECT MIN(date) FROM games WHERE games.match_day_id = ? AND games.date IS NOT NULL)
     WHERE id = ? AND EXISTS (SELECT 1 FROM games WHERE games.match_day_id = ? AND games.date IS NOT NULL)`,
  ).bind(matchDayId, matchDayId, matchDayId)
}
async function recomputeMatchDayDate(db: Env['Bindings']['DB'], matchDayId: string) {
  await matchDayDateRecomputeStmt(db, matchDayId).run()
}

// POST /fftt/games-preview — per group: what an import would do
// (rounds/matches found, games and opponents to create). POST because the
// browser sends the FFTT pools payload it fetched (see the transport note on
// the teams import); the flags are computed here, against D1.
app.post('/fftt/games-preview', async (c) => {
  const b = await c.req.json()
  const groupIds = parseGroupIds(b.groupIds)
  if (groupIds.length === 0) return c.json({ error: 'invalid_params' }, 400)
  // Optional scope (#287): importing from a team card imports that team's
  // fixtures only, not every match of its pool.
  const onlyTeamId = typeof b.teamId === 'string' && b.teamId ? b.teamId : null
  const db = c.env.DB
  const ctxs = await gamesImportContext(db, groupIds, b.pools, onlyTeamId)

  const [clubRows, teamRows, mdRows, gameRows] = await Promise.all([
    db.prepare('SELECT id, affiliation_number FROM clubs').all(),
    db.prepare('SELECT id, club_id, phase_id, number, default_day FROM teams').all(),
    db.prepare('SELECT id, group_id, number FROM match_days').all(),
    db.prepare('SELECT id, match_day_id, home_team_id, away_team_id, date, game_id, source FROM games').all(),
  ])
  const resolver = makeTeamResolver(clubRows.results, teamRows.results)
  const existingByGroup = gamesByGroupId(mdRows.results, gameRows.results)
  const matchDayKeys = new Set(mdRows.results.map((m) => `${m.group_id}|${m.number}`))
  const matchDayIdByKey = new Map(mdRows.results.map((m) => [`${m.group_id}|${m.number}`, m.id as string]))
  // A game already imported from a PDF carries no FFTT match id, so the id
  // check alone counted it as new and the preview promised matches the import
  // then skipped (#289). Recognise it by its pairing on the same journée —
  // the same second key the import itself uses.
  const ffttGameIds = new Set(
    gameRows.results.flatMap((g) => (g.game_id ? [g.game_id as string] : [g.id as string])),
  )
  const existingByPairing = new Map<string, { id: string; date: string | null; ffttId: string | null }>()
  for (const g of gameRows.results) {
    const key = (home: unknown, away: unknown) => `${g.match_day_id}|${home}|${away}`
    const entry = {
      id: g.id as string, date: (g.date as string | null) ?? null,
      ffttId: (g.game_id as string | null) ?? null,
    }
    existingByPairing.set(key(g.home_team_id, g.away_team_id), entry)
    existingByPairing.set(key(g.away_team_id, g.home_team_id), entry)
  }
  const gameIds = ffttGameIds

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
    let newGames = 0, existingGames = 0, newMatchDays = 0, dateMismatches = 0, ffttIdsToLink = 0
    const groupNewTeams = new Set<string>()
    const seenRounds = new Set<number>()
    for (const m of ctx.matches) {
      rounds.add(m.round)
      if (!seenRounds.has(m.round)) {
        seenRounds.add(m.round)
        if (!matchDayKeys.has(`${ctx.groupId}|${m.round}`)) newMatchDays++
      }
      // Already here, by FFTT match id or by pairing on the same journée.
      const mdId = matchDayIdByKey.get(`${ctx.groupId}|${m.round}`)
      const homeId = resolver.resolve(m.home, ctx.phaseId!)
      const awayId = resolver.resolve(m.away, ctx.phaseId!)
      const byPairing = mdId && homeId && awayId
        ? existingByPairing.get(`${mdId}|${homeId}|${awayId}`)
        : undefined
      if (gameIds.has(m.id) || byPairing) {
        existingGames++
        // Present but with no FFTT match id — imported from a document. The
        // import adopts the id (#294), which is real work even when there is
        // nothing new to create, so the preview has to report it or the
        // confirm button stays disabled and the link never happens.
        if (byPairing && !byPairing.ffttId) ffttIdsToLink++
        const storedDate = byPairing
          ? byPairing.date
          : gameRows.results.find((g) => (g.game_id ?? g.id) === m.id)?.date ?? null
        // Compare against the date an import would actually write — the home
        // club's day, not FFTT's nominal weekend (#299). Comparing to m.date
        // raw reported every correctly-shifted home fixture as "à une autre
        // date", offering to move it back onto the Sunday.
        const wouldWrite = homeGameDate(m.date, resolver.defaultDayOf(homeId ?? ''))
        if (storedDate && storedDate !== wouldWrite) dateMismatches++
      } else newGames++
      for (const side of [m.home, m.away]) {
        if (resolver.resolve(side, ctx.phaseId!)) continue
        groupNewTeams.add(`${side.clubIdentifier}|${side.teamName}`)
        newTeamKeys.add(`${side.clubIdentifier}|${side.teamName}|${ctx.phaseId}`)
        if (side.clubIdentifier && !resolver.clubByAffiliation.has(side.clubIdentifier)) {
          newClubIdentifiers.add(side.clubIdentifier)
        }
      }
    }
    // What the import would REMOVE (#422): fixtures the pool no longer has,
    // and teams the repêchage moved out of it. Never in single-team mode —
    // that scope only sees a slice of the calendar, so everything else in the
    // pool would read as gone.
    let obsolete = { ids: [] as string[], manual: 0 }
    let departing: string[] = []
    if (!onlyTeamId) {
      const sourceRounds = ffttSourceRounds(
        ctx.matches,
        (side) => resolver.resolve(side, ctx.phaseId!),
        (round) => matchDayIdByKey.get(`${ctx.groupId}|${round}`),
      )
      obsolete = obsoleteGames(existingByGroup.get(ctx.groupId) ?? [], sourceRounds)
      departing = departingTeamIds(ctx.group.teamIds, playingTeamIds(sourceRounds))
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
      /** Present locally, absent from the pool FFTT now publishes (#422). */
      obsoleteGames: obsolete.ids.length,
      /** Of those, how many carry a slot agreed by hand (#294). */
      obsoleteManualGames: obsolete.manual,
      /** Teams of the group playing none of the pool's matches any more (#422). */
      departingTeams: departing.length,
      // Already present but on another date than FFTT now publishes (#289) —
      // a PDF calendar's real slot, or a genuine reschedule. Never applied
      // silently; the import only touches them when asked.
      dateMismatches,
      /** Existing games that would gain their FFTT match id (#294). */
      ffttIdsToLink,
      newTeams: groupNewTeams.size,
    }
  })

  return c.json({ groups, totals: { newClubs: newClubIdentifiers.size, newTeams: newTeamKeys.size } })
})

// POST /games/import — re-fetches from FFTT (never trusts a client list),
// auto-creates missing opponent clubs/teams, and inserts the games not
// already present (matched by FFTT match id, or same pairing on the same
// journée for manually created ones). Scores are not imported (#231); manual
// game times are never touched. Each game owns its own date (#271); a
// journée's (match_day's) date is derived — recomputed from its games by
// matchDayDateRecomputeStmt — so a round staggered across several real dates
// no longer collapses onto whichever match was imported last.
app.post('/games/import', async (c) => {
  const b = await c.req.json()
  const groupIds = parseGroupIds(b.groupIds)
  if (groupIds.length === 0) return c.json({ error: 'invalid_params' }, 400)
  const onlyTeamId = typeof b.teamId === 'string' && b.teamId ? b.teamId : null
  // Opt-in (#289): an existing game's date is only replaced by FFTT's when
  // asked. A PDF calendar states the real slot — day AND time — while FFTT
  // publishes a nominal weekend date, so overwriting by default would trade
  // good data for worse. Left off, a re-import still adds what is missing.
  const updateDates = b.updateDates === true
  // Opt-in too (#422): a pool rebuilt mid-season leaves fixtures that are no
  // longer played and teams that left. Nothing is ever removed unless asked,
  // and never in single-team mode, which sees only part of the calendar.
  const removeObsolete = b.removeObsolete === true && !onlyTeamId
  const db = c.env.DB
  const ctxs = await gamesImportContext(db, groupIds, b.pools, onlyTeamId)

  const [clubRows, teamRows, mdRows, gameRows] = await Promise.all([
    db.prepare('SELECT id, affiliation_number FROM clubs').all(),
    db.prepare('SELECT id, club_id, phase_id, number, default_day FROM teams').all(),
    db.prepare('SELECT id, group_id, number, date FROM match_days').all(),
    db.prepare('SELECT id, match_day_id, home_team_id, away_team_id, date, game_id, source FROM games').all(),
  ])
  const resolver = makeTeamResolver(clubRows.results, teamRows.results)
  const existingByGroup = gamesByGroupId(mdRows.results, gameRows.results)
  const matchDayByKey = new Map(mdRows.results.map((m) => [`${m.group_id}|${m.number}`, m]))
  const gameIds = new Set(gameRows.results.map((g) => g.id as string))
  const existingGameDateById = new Map(gameRows.results.map((g) => [g.id as string, g.date as string | null]))
  // A slot agreed between clubs is never overwritten by an import (#294).
  const manualGameIds = new Set(
    gameRows.results.flatMap((g) => (g.source === 'manual' ? [g.id as string] : [])),
  )
  /** Games that carry no FFTT match id yet and can adopt the one FFTT just gave. */
  const ffttIdBackfill: Array<{ id: string; ffttId: string }> = []
  let manualKept = 0
  const pairingsByMatchDay = new Map<string, Set<string>>()
  // The row behind a pairing, so its date can be adjusted rather than only
  // recognised (#289).
  const existingGameByPairing = new Map<string, { id: string; date: string | null; ffttId: string | null; source: string | null }>()
  for (const g of gameRows.results) {
    const key = g.match_day_id as string
    if (!pairingsByMatchDay.has(key)) pairingsByMatchDay.set(key, new Set())
    pairingsByMatchDay.get(key)!.add(`${g.home_team_id}|${g.away_team_id}`)
    pairingsByMatchDay.get(key)!.add(`${g.away_team_id}|${g.home_team_id}`)
    const entry = {
      id: g.id as string, date: (g.date as string | null) ?? null,
      ffttId: (g.game_id as string | null) ?? null, source: (g.source as string | null) ?? null,
    }
    existingGameByPairing.set(`${key}|${g.home_team_id}|${g.away_team_id}`, entry)
    existingGameByPairing.set(`${key}|${g.away_team_id}|${g.home_team_id}`, entry)
  }

  const createdClubs: Array<Record<string, unknown>> = []
  const createdTeams: Array<Record<string, unknown>> = []
  const createdMatchDays: Array<Record<string, unknown>> = []
  const updatedMatchDays: Array<Record<string, unknown>> = []
  const createdGames: Array<Record<string, unknown>> = []
  const updatedGames: Array<{ id: string; date: string }> = []
  // Every match_day that gained a new game or had an existing game's date
  // change — recomputed (derived date) after the batch, then re-read to
  // build the response's created/updatedMatchDays from the authoritative DB
  // state rather than JS-side guesswork.
  const touchedMatchDayIds = new Set<string>()
  const touchedGroups = new Map<string, { id: string; divisionId: string; number: number; teamIds: string[]; isArchived: boolean }>()
  const skippedGroups: Array<{ groupId: string; reason: GamesGroupError }> = []
  let existingGames = 0, skippedMatches = 0
  /** Fixtures the pool no longer has, removed only when asked (#422). */
  const obsoleteGameIds: string[] = []
  let obsoleteManualGames = 0
  /** Teams dropped from a group's roster because the pool changed (#422). */
  let departedTeams = 0

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

    // NOT named teamIdFor: it used to be, which shadowed the imported
    // teamIdFor(clubId, phaseId, number) and turned the call below into a
    // recursive one with the wrong arguments. It returned null, and every
    // opponent team was inserted with a NULL id (#284).
    const resolveOrCreateTeam = (side: FfttMatchTeam): string | null => {
      const existing = resolver.resolve(side, ctx.phaseId!)
      if (existing) return existing
      const clubId = clubIdFor(side)
      if (!clubId || side.teamNumber === null) return null
      // Derived from (club, phase, number) (#282), which is phase-scoped by
      // construction — the old "suffix the FFTT id when it's taken" hack is
      // gone. The FFTT team id lives in team_id.
      const id = teamIdFor(clubId, ctx.phaseId!, side.teamNumber)
      // Belt and braces (#284): never queue a team without an id. The bug this
      // guards against pushed 84 NULL-id rows into production before anyone
      // noticed, because the caller only checks the RETURN value.
      if (!id) return null
      createdTeams.push({
        id, teamId: side.teamId, clubId, phaseId: ctx.phaseId, number: side.teamNumber,
        groupId: group.id, gameLocationId: '',
        defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false,
      })
      resolver.register(id, clubId, side.teamNumber, ctx.phaseId!, side.teamId, '')
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
        touchedMatchDayIds.add(md.id as string)
      }

      if (gameIds.has(m.id)) {
        existingGames++
        if (manualGameIds.has(m.id)) manualKept++
        else if (updateDates) {
          // Re-dating must apply the SAME rule as creating (#299): the home
          // club plays on its own day, so FFTT's nominal weekend date moves
          // back to it. Writing m.date raw here undid the shift the creating
          // import had already applied — a second run put every home fixture
          // back on the Sunday.
          const at = homeGameDate(m.date, resolver.defaultDayOf(resolver.resolve(m.home, ctx.phaseId!) ?? ''))
          if (existingGameDateById.get(m.id) !== at) {
            updatedGames.push({ id: m.id, date: at })
            touchedMatchDayIds.add(md.id as string)
          }
        }
        continue
      }
      const homeId = resolveOrCreateTeam(m.home)
      const awayId = resolveOrCreateTeam(m.away)
      if (!homeId || !awayId) { skippedMatches++; continue }
      // A game for the same pairing on the same journée already exists —
      // created by hand or by the PDF import, which carries no FFTT match id.
      // Never duplicate it; adjust its date only when asked (#289).
      const pairings = pairingsByMatchDay.get(md.id as string)
      if (pairings?.has(`${homeId}|${awayId}`)) {
        existingGames++
        const existing = existingGameByPairing.get(`${md.id}|${homeId}|${awayId}`)
        // Adopt the FFTT match id (#294): a game created from a PDF has none,
        // so every later import had to fall back to matching by pairing. Once
        // it carries the id, the stronger key applies — and this says nothing
        // about the slot, so it happens even for a manually agreed one.
        if (existing && !existing.ffttId) ffttIdBackfill.push({ id: existing.id, ffttId: m.id })
        if (existing?.source === 'manual') manualKept++
        else if (updateDates && existing) {
          // Same shift as on creation (#299).
          const at = homeGameDate(m.date, resolver.defaultDayOf(homeId))
          if (existing.date !== at) {
            updatedGames.push({ id: existing.id, date: at })
            touchedMatchDayIds.add(md.id as string)
          }
        }
        continue
      }
      if (!pairingsByMatchDay.has(md.id as string)) pairingsByMatchDay.set(md.id as string, new Set())
      pairingsByMatchDay.get(md.id as string)!.add(`${homeId}|${awayId}`)
      pairingsByMatchDay.get(md.id as string)!.add(`${awayId}|${homeId}`)
      gameIds.add(m.id)
      // Derived local id, FFTT match id kept in game_id (#282) — the dedup
      // above still matches on the FFTT id, which is why it has its own column.
      // The home team plays on its own day (#287): FFTT's nominal weekend
      // date moves back to the preceding occurrence of default_day. Away games
      // keep FFTT's date — they are played at the opponent's venue on the
      // opponent's day.
      createdGames.push({
        id: gameIdFor(md.id as string, homeId, awayId), gameId: m.id,
        matchDayId: md.id, homeTeamId: homeId, awayTeamId: awayId,
        date: homeGameDate(m.date, resolver.defaultDayOf(homeId)),
      })
      touchedMatchDayIds.add(md.id as string)
    }

    // The other direction (#422): what this pool no longer holds. Computed
    // after the loop, so the resolver already knows the opponents this run
    // created — an unresolved side then means a team that is genuinely not
    // ours, not one we simply hadn't created yet.
    if (removeObsolete) {
      const sourceRounds = ffttSourceRounds(
        ctx.matches,
        (side) => resolver.resolve(side, ctx.phaseId!),
        (round) => matchDayByKey.get(`${ctx.groupId}|${round}`)?.id as string | undefined,
      )
      const groupGames = existingByGroup.get(ctx.groupId) ?? []
      const obsolete = obsoleteGames(groupGames, sourceRounds)
      obsoleteGameIds.push(...obsolete.ids)
      obsoleteManualGames += obsolete.manual
      const departing = new Set(departingTeamIds(group.teamIds, playingTeamIds(sourceRounds)))
      if (departing.size) {
        // Only the group's membership: the team row stays, it may belong to a
        // club that uses the app, with its own roster and captain.
        group.teamIds = group.teamIds.filter((id) => !departing.has(id))
        departedTeams += departing.size
        touchedGroups.set(group.id, group)
      }
      // Their journées lose a game, so their derived date is recomputed too.
      const matchDayOf = new Map(groupGames.map((g) => [g.id, g.matchDayId]))
      for (const id of obsolete.ids) touchedMatchDayIds.add(matchDayOf.get(id)!)
    }
  }

  // Journées whose last game just went (#422) — an empty journée is a shell
  // the UI would still list. Computed across every touched group at once,
  // against the games this run creates as well as the ones it removes.
  const emptiedMatchDays = removeObsolete
    ? emptiedMatchDayIds(
        [...existingByGroup.values()].flat(), obsoleteGameIds,
        createdGames.map((g) => ({ matchDayId: g.matchDayId as string })),
      )
    : []

  const stmts = [
    // OR IGNORE on clubs/teams/match_days/games: their ids are fully
    // deterministic (club-fftt-<affiliation>, the FFTT team id, md-fftt-<group>-r<round>,
    // the FFTT match id), so a leftover/stale row this request's own
    // freshly-queried resolver didn't happen to recognize (e.g. a club row
    // from another import path with a mismatched/missing affiliation number)
    // can never collide with different data, only with itself; ignoring the
    // redundant insert keeps this safe instead of a hard 500 (see the same
    // pattern in /schedule-documents/import).
    ...createdClubs.map((cl) =>
      db.prepare('INSERT OR IGNORE INTO clubs (id, affiliation_number, display_name, is_archived) VALUES (?, ?, ?, 0)')
        .bind(cl.id, cl.affiliationNumber, cl.displayName)),
    ...createdTeams.map((t) =>
      db.prepare(
        `INSERT OR IGNORE INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, is_archived, team_id)
         VALUES (?, ?, ?, ?, ?, '', '', '', '', '[]', 0, ?)`,
      ).bind(t.id, t.clubId, t.phaseId, t.number, t.groupId, t.teamId ?? null)),
    ...[...touchedGroups.values()].map((g) =>
      db.prepare('UPDATE groups SET team_ids = ? WHERE id = ?').bind(jsonStr(g.teamIds), g.id)),
    ...createdMatchDays.map((m) =>
      db.prepare('INSERT OR IGNORE INTO match_days (id, group_id, number, date) VALUES (?, ?, ?, ?)')
        .bind(m.id, m.groupId, m.number, m.date)),
    ...createdGames.map((g) =>
      db.prepare("INSERT OR IGNORE INTO games (id, match_day_id, home_team_id, away_team_id, time, date, game_id, source) VALUES (?, ?, ?, ?, NULL, ?, ?, 'fftt')")
        .bind(g.id, g.matchDayId, g.homeTeamId, g.awayTeamId, g.date, g.gameId ?? null)),
    ...updatedGames.map((g) =>
      // Re-dated from FFTT, so that is now the source of the slot.
      db.prepare("UPDATE games SET date = ?, source = 'fftt' WHERE id = ?").bind(g.date, g.id)),
    // Adopt the FFTT match id where the game had none (#294).
    ...ffttIdBackfill.map((g) =>
      db.prepare('UPDATE games SET game_id = ? WHERE id = ? AND game_id IS NULL').bind(g.ffttId, g.id)),
    // Fixtures the pool no longer holds, with their availabilities and
    // compositions, then the journées they leave empty (#422).
    ...clearGamesByIds(db, obsoleteGameIds),
    ...deleteMatchDaysByIds(db, emptiedMatchDays),
    // Last: recompute every touched journée's derived date from its (now
    // fully written) games.
    ...[...touchedMatchDayIds].map((id) => matchDayDateRecomputeStmt(db, id)),
  ]
  try {
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  } catch (err) {
    console.error('games/import batch failed', err)
    return c.json({ error: 'import_failed', message: err instanceof Error ? err.message : String(err) }, 500)
  }

  // Re-read every touched match_day's authoritative (derived) date rather
  // than recomputing it in JS — one source of truth (SQL), and it's what
  // gives a brand-new round the right date even when its matches were
  // processed out of date order.
  if (touchedMatchDayIds.size) {
    const ids = [...touchedMatchDayIds]
    const fresh = await db.prepare(
      `SELECT id, group_id, number, date FROM match_days WHERE id IN (${ids.map(() => '?').join(',')})`,
    ).bind(...ids).all()
    const createdMatchDayIds = new Set(createdMatchDays.map((m) => m.id as string))
    const priorDateById = new Map(mdRows.results.map((m) => [m.id as string, m.date as string]))
    for (const row of fresh.results) {
      const id = row.id as string
      const created = createdMatchDayIds.has(id) ? createdMatchDays.find((m) => m.id === id) : undefined
      if (created) {
        created.date = row.date
      } else if (priorDateById.get(id) !== row.date) {
        updatedMatchDays.push({ id, groupId: row.group_id, number: row.number, date: row.date })
      }
    }
  }

  return c.json({
    createdClubs,
    createdTeams,
    // Groups whose team list changed, in their final state (client-side upsert).
    groups: [...touchedGroups.values()],
    createdMatchDays,
    updatedMatchDays,
    createdGames,
    updatedGames,
    skippedGroups,
    existingGames,
    /** Fixtures removed because the pool no longer holds them (#422). */
    deletedGames: obsoleteGameIds,
    /** Of those, how many carried a slot agreed by hand. */
    deletedManualGames: obsoleteManualGames,
    /** Journées deleted because they were left with no game at all. */
    deletedMatchDays: emptiedMatchDays,
    /** Teams dropped from a group's roster, having left the pool. */
    departedTeams,
    /** Already present and agreed by hand, so left exactly as they are (#294). */
    manualKept,
    /** Games that gained their FFTT match id in this run (#294). */
    ffttIdsBackfilled: ffttIdBackfill.length,
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

interface ScheduleDocTeamInput { name: string; number: number; affiliationNumber: string; day: string; time: string }
interface ScheduleDocMatchInput { homeName: string; homeNumber: number; awayName: string; awayNumber: number; date: string | null; time: string }
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
    out.push({
      name: x.name.trim().slice(0, 80), number: x.number, affiliationNumber: x.affiliationNumber,
      // "Samedi" / "16h00" from the roster table (#294).
      day: typeof x.day === 'string' ? x.day.trim().slice(0, 12) : '',
      time: typeof x.time === 'string' ? x.time.trim().slice(0, 10) : '',
    })
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
        const date = typeof y.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(y.date) ? y.date : null
        matches.push({
          homeName: y.homeName.trim().slice(0, 80), homeNumber: y.homeNumber,
          awayName: y.awayName.trim().slice(0, 80), awayNumber: y.awayNumber, date,
          // "19h30" and the like; kept short and free-form, same as the team
          // default it stands in for.
          time: typeof y.time === 'string' ? y.time.trim().slice(0, 10) : '',
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
  const b = await c.req.json<Record<string, unknown>>()
  const schedules = (Array.isArray(b.schedules) ? b.schedules.slice(0, 10) : [])
    .map(parseScheduleDocInput)
    .filter((s): s is ScheduleDocInput => s !== null)
  if (schedules.length === 0) return c.json({ error: 'invalid_params' }, 400)
  // Opt-in, mirroring the FFTT import (#289/#294): the document is
  // authoritative on day and time, but refreshing an existing game is still
  // the user's call.
  const updateSlots = b.updateSlots === true
  // Opt-in as well (#422): a reissued calendar ("ANNULE ET REMPLACE") states a
  // pool whose composition changed, so what it no longer holds is gone —
  // fixtures and teams alike. Never applied unless asked.
  const removeObsolete = b.removeObsolete === true

  const db = c.env.DB
  const [seasonRows, phaseRows, divisionRows, groupRows, clubRows, teamRows, mdRows, gameRows] = await Promise.all([
    db.prepare('SELECT id, display_name FROM seasons').all(),
    db.prepare('SELECT id, season_id, name, display_name, status FROM phases').all(),
    db.prepare('SELECT id, phase_id, display_name, rank, players_per_game FROM divisions').all(),
    db.prepare('SELECT id, division_id, number, team_ids FROM groups').all(),
    db.prepare('SELECT id, affiliation_number FROM clubs').all(),
    db.prepare('SELECT id, club_id, phase_id, number, default_day FROM teams').all(),
    db.prepare('SELECT id, group_id, number, date FROM match_days').all(),
    db.prepare('SELECT id, match_day_id, home_team_id, away_team_id, date, time, source FROM games').all(),
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
    teamIds: jsonParseIds(g.team_ids), isArchived: false,
  }]))
  const groupNumbersByDivision = new Map<string, Set<number>>()
  for (const g of groupById.values()) {
    if (!groupNumbersByDivision.has(g.divisionId)) groupNumbersByDivision.set(g.divisionId, new Set())
    groupNumbersByDivision.get(g.divisionId)!.add(g.number)
  }
  const resolver = makeTeamResolver(clubRows.results, teamRows.results)
  const existingByGroup = gamesByGroupId(mdRows.results, gameRows.results)
  const matchDayByKey = new Map(mdRows.results.map((m) => [`${m.group_id}|${m.number}`, m]))
  const pairingsByMatchDay = new Map<string, Set<string>>()
  /** Existing games by (journée, home, away), so the document — which is
   *  authoritative on day and time — can refresh them instead of skipping. */
  const docExistingByPairing = new Map<string, { id: string; date: string | null; time: string | null; source: string | null }>()
  for (const g of gameRows.results) {
    const key = g.match_day_id as string
    if (!pairingsByMatchDay.has(key)) pairingsByMatchDay.set(key, new Set())
    pairingsByMatchDay.get(key)!.add(`${g.home_team_id}|${g.away_team_id}`)
    pairingsByMatchDay.get(key)!.add(`${g.away_team_id}|${g.home_team_id}`)
    const entry = {
      id: g.id as string, date: (g.date as string | null) ?? null,
      time: (g.time as string | null) ?? null, source: (g.source as string | null) ?? null,
    }
    docExistingByPairing.set(`${key}|${g.home_team_id}|${g.away_team_id}`, entry)
    docExistingByPairing.set(`${key}|${g.away_team_id}|${g.home_team_id}`, entry)
  }

  const createdPhases: Array<{ id: string; seasonId: string; name: string; displayName: string; status: string }> = []
  const createdDivisions: Array<{ id: string; phaseId: string; displayName: string; rank: number; playersPerGame: number; isArchived: boolean }> = []
  const createdGroupIds = new Set<string>()
  const createdClubs: Array<{ id: string; affiliationNumber: string; displayName: string; isArchived: boolean; addresses: []; channels: [] }> = []
  const createdTeams: Array<Record<string, unknown>> = []
  /** Existing teams with no playing day recorded, to seed from the roster (#294). */
  const teamDefaultsToFill: Array<{ id: string; day: string; time: string }> = []
  const touchedGroups = new Map<string, GroupState>()
  const createdMatchDays: Array<{ id: string; groupId: string; number: number; date: string }> = []
  const updatedMatchDays: Array<{ id: string; groupId: string; number: number; date: string }> = []
  const createdGames: Array<{ id: string; matchDayId: string; homeTeamId: string; awayTeamId: string; date: string | null; time?: string; gameId?: string }> = []
  // Every match_day that gained a game (created here, or an already-existing
  // one from an earlier FFTT/doc import) — recomputed (derived date) after
  // the batch, then re-read to build updatedMatchDays from the authoritative
  // DB state, same pattern as /games/import (#271).
  const touchedMatchDayIds = new Set<string>()
  const skippedSchedules: Array<{ index: number; reason: string }> = []
  const skippedMatchDetails: Array<{ side: 'home' | 'away'; name: string; number: number }> = []
  /** Existing games whose slot differs from the document's (#294). */
  let slotMismatches = 0
  /** Existing games left alone because their slot was agreed by hand. */
  let manualKept = 0
  const updatedGameSlots: Array<{ id: string; date: string | null; time: string | null }> = []
  let existingGames = 0
  let skippedMatches = 0
  /** Fixtures the document no longer states, removed only when asked (#422). */
  const obsoleteGameIds: string[] = []
  let obsoleteManualGames = 0
  /** Teams dropped from a group's roster because the pool changed (#422). */
  let departedTeams = 0

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
        // Derived (#282): the PDF path and the FFTT path now land on the same
        // id for the same team, instead of doc-* alongside the FFTT id. No
        // FFTT team id is available here, so team_id stays NULL.
        teamId = teamIdFor(clubId, phaseId, t.number)
        createdTeams.push({
          id: teamId, clubId, phaseId, number: t.number, groupId,
          // The roster states this club's playing day and time (#294), which
          // is what lets a fixture show a real slot instead of the journée's
          // week — an opponent created by the FFTT import has neither.
          gameLocationId: '', defaultDay: t.day, defaultTime: t.time,
          captainId: '', playerIds: [], isArchived: false,
        })
        resolver.register(teamId, clubId, t.number, phaseId, side.teamId, t.day)
      } else if (t.day || t.time) {
        // Already known, but possibly without a playing day — adopt the
        // document's rather than leave the team blank. Never overwrite a day
        // already recorded: that one may have been set by hand.
        teamDefaultsToFill.push({ id: teamId, day: t.day, time: t.time })
      }
      if (!group.teamIds.includes(teamId)) group.teamIds.push(teamId)
      const normalizedName = normalizeTeamNameKey(t.name)
      teamKeyToId.set(`${normalizedName}|${t.number}`, teamId)
      if (!rosterByNumber.has(t.number)) rosterByNumber.set(t.number, [])
      rosterByNumber.get(t.number)!.push({ normalizedName, teamId })
    }
    touchedGroups.set(groupId, group)
    // The roster table IS the document's statement of the pool composition
    // (#422) — more direct than reading it back off the matches.
    const rosterTeamIds = [...new Set(teamKeyToId.values())]
    const docRounds: SourceRound[] = []

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
        touchedMatchDayIds.add(md.id as string)
      }
      const sourceRound: SourceRound = { matchDayId: md.id as string, pairings: [] }
      docRounds.push(sourceRound)
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
          // Half-read journée (#422): a name the OCR mangled says nothing
          // about whether that fixture is still played, so this round is
          // excluded from the obsolescence comparison entirely.
          sourceRound.incomplete = true
          if (skippedMatchDetails.length < 30) {
            if (!homeId) skippedMatchDetails.push({ side: 'home', name: m.homeName, number: m.homeNumber })
            if (!awayId) skippedMatchDetails.push({ side: 'away', name: m.awayName, number: m.awayNumber })
          }
          continue
        }
        sourceRound.pairings.push({ homeTeamId: homeId, awayTeamId: awayId })
        const mdId = md.id as string
        const pairings = pairingsByMatchDay.get(mdId)
        // Dedup by pairing-on-journée, not by game id: unlike the FFTT games
        // import, these ids have no stable external source, so re-uploading
        // the same document must still recognize matches already imported.
        if (pairings?.has(`${homeId}|${awayId}`)) {
          existingGames++
          // The document states the real day and time, so an existing game
          // gets refreshed rather than skipped (#294) — but only when asked,
          // and never when its slot was agreed by hand.
          const existing = docExistingByPairing.get(`${mdId}|${homeId}|${awayId}`)
          const docDate = m.date ?? j.date
          if (existing) {
            if (existing.source === 'manual') manualKept++
            else if ((docDate && existing.date !== docDate) || (m.time && existing.time !== m.time)) {
              if (updateSlots) {
                updatedGameSlots.push({ id: existing.id, date: docDate, time: m.time || null })
                touchedMatchDayIds.add(mdId)
              } else slotMismatches++
            }
          }
          continue
        }
        if (!pairingsByMatchDay.has(mdId)) pairingsByMatchDay.set(mdId, new Set())
        pairingsByMatchDay.get(mdId)!.add(`${homeId}|${awayId}`)
        pairingsByMatchDay.get(mdId)!.add(`${awayId}|${homeId}`)
        // Derived (#282); a PDF calendar carries no FFTT match id, so gameId
        // stays undefined and the insert binds NULL.
        createdGames.push({
          id: gameIdFor(mdId, homeId, awayId), matchDayId: mdId,
          homeTeamId: homeId, awayTeamId: awayId, date: m.date ?? j.date,
          // A document states the real slot, so the game carries it outright
          // (#289) instead of leaning on the home club's defaults.
          time: m.time || undefined,
        })
        touchedMatchDayIds.add(mdId)
      }
    }

    // What this edition of the calendar no longer holds (#422). The roster
    // gives the pool's composition outright; the journées give the fixtures,
    // minus any round the OCR only half read.
    if (removeObsolete) {
      const obsolete = obsoleteGames(existingByGroup.get(groupId) ?? [], docRounds)
      obsoleteGameIds.push(...obsolete.ids)
      obsoleteManualGames += obsolete.manual
      const departing = new Set(departingTeamIds(group.teamIds, rosterTeamIds))
      if (departing.size) {
        // Group membership only — the team row belongs to its own club.
        group.teamIds = group.teamIds.filter((id) => !departing.has(id))
        departedTeams += departing.size
        touchedGroups.set(groupId, group)
      }
      const matchDayOf = new Map((existingByGroup.get(groupId) ?? []).map((g) => [g.id, g.matchDayId]))
      for (const id of obsolete.ids) touchedMatchDayIds.add(matchDayOf.get(id)!)
    }
  }

  // Journées left with no game at all once the obsolete ones are gone (#422).
  const emptiedMatchDays = removeObsolete
    ? emptiedMatchDayIds(
        [...existingByGroup.values()].flat(), obsoleteGameIds,
        createdGames.map((g) => ({ matchDayId: g.matchDayId })),
      )
    : []

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
        ? db.prepare('INSERT INTO groups (id, division_id, number, team_ids, is_archived) VALUES (?, ?, ?, ?, 0)')
          .bind(g.id, g.divisionId, g.number, jsonStr(g.teamIds))
        : db.prepare('UPDATE groups SET team_ids = ? WHERE id = ?').bind(jsonStr(g.teamIds), g.id)),
    ...createdTeams.map((t) =>
      db.prepare(
        `INSERT OR IGNORE INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, is_archived, team_id)
         VALUES (?, ?, ?, ?, ?, '', '', '', '', '[]', 0, ?)`,
      ).bind(t.id, t.clubId, t.phaseId, t.number, t.groupId, t.teamId ?? null)),
    ...createdMatchDays.map((m) =>
      db.prepare('INSERT OR IGNORE INTO match_days (id, group_id, number, date) VALUES (?, ?, ?, ?)')
        .bind(m.id, m.groupId, m.number, m.date)),
    // Seed a playing day/time on teams that have none (#294) — COALESCE-style
    // guards so a value already recorded (possibly by hand) is never replaced.
    ...teamDefaultsToFill.filter((t) => !!t.day).map((t) =>
      db.prepare("UPDATE teams SET default_day = ? WHERE id = ? AND (default_day IS NULL OR default_day = '')").bind(t.day, t.id)),
    ...teamDefaultsToFill.filter((t) => !!t.time).map((t) =>
      db.prepare("UPDATE teams SET default_time = ? WHERE id = ? AND (default_time IS NULL OR default_time = '')").bind(t.time, t.id)),
    // Refresh the slot of games the document knows better (#294).
    ...updatedGameSlots.map((g) =>
      db.prepare("UPDATE games SET date = ?, time = coalesce(?, time), source = 'document' WHERE id = ? AND coalesce(source, '') <> 'manual'")
        .bind(g.date, g.time, g.id)),
    ...createdGames.map((g) =>
      db.prepare("INSERT OR IGNORE INTO games (id, match_day_id, home_team_id, away_team_id, time, date, game_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'document')")
        .bind(g.id, g.matchDayId, g.homeTeamId, g.awayTeamId, g.time ?? null, g.date, g.gameId ?? null)),
    // Fixtures this edition dropped, with their availabilities and
    // compositions, then the journées they leave empty (#422).
    ...clearGamesByIds(db, obsoleteGameIds),
    ...deleteMatchDaysByIds(db, emptiedMatchDays),
    // Last: recompute every touched journée's derived date from its (now
    // fully written) games (#271).
    ...[...touchedMatchDayIds].map((id) => matchDayDateRecomputeStmt(db, id)),
  ]
  try {
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  } catch (err) {
    console.error('schedule-documents/import batch failed', err)
    return c.json({ error: 'import_failed', message: err instanceof Error ? err.message : String(err) }, 500)
  }

  // Re-read every touched match_day's authoritative (derived) date, same
  // pattern as /games/import: one source of truth (SQL), not JS-side
  // guesswork, and it's what catches a journée whose derived date shifted
  // because a game landed under an already-existing match_day.
  if (touchedMatchDayIds.size) {
    const ids = [...touchedMatchDayIds]
    const fresh = await db.prepare(
      `SELECT id, group_id, number, date FROM match_days WHERE id IN (${ids.map(() => '?').join(',')})`,
    ).bind(...ids).all()
    const createdMatchDayIds = new Set(createdMatchDays.map((m) => m.id))
    const priorDateById = new Map(mdRows.results.map((m) => [m.id as string, m.date as string]))
    for (const row of fresh.results) {
      const id = row.id as string
      const created = createdMatchDayIds.has(id) ? createdMatchDays.find((m) => m.id === id) : undefined
      if (created) {
        created.date = row.date as string
      } else if (priorDateById.get(id) !== row.date) {
        updatedMatchDays.push({ id, groupId: row.group_id as string, number: row.number as number, date: row.date as string })
      }
    }
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
    updatedMatchDays,
    createdGames,
    skippedSchedules,
    existingGames,
    /** Fixtures removed because this edition no longer states them (#422). */
    deletedGames: obsoleteGameIds,
    /** Of those, how many carried a slot agreed by hand. */
    deletedManualGames: obsoleteManualGames,
    /** Journées deleted because they were left with no game at all. */
    deletedMatchDays: emptiedMatchDays,
    /** Teams dropped from a group's roster, absent from the document. */
    departedTeams,
    /** Existing games whose slot differs from the document's (#294). */
    slotMismatches,
    /** Left exactly as they are because their slot was agreed by hand. */
    manualKept,
    updatedGameSlots: updatedGameSlots.length,
    skippedMatches,
    skippedMatchDetails,
  })
})

app.delete('/seasons/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const phases = 'SELECT id FROM phases WHERE season_id = ?'
  const divisions = `SELECT id FROM divisions WHERE phase_id IN (${phases})`
  const groups = `SELECT id FROM groups WHERE division_id IN (${divisions})`
  const teams = `SELECT id FROM teams WHERE phase_id IN (${phases})`
  await db.batch([
    ...clearGroupsAndTeams(db, groups, teams, id),
    db.prepare(`DELETE FROM groups WHERE division_id IN (${divisions})`).bind(id),
    db.prepare(`DELETE FROM divisions WHERE phase_id IN (${phases})`).bind(id),
    db.prepare('DELETE FROM phases WHERE season_id = ?').bind(id),
    db.prepare('DELETE FROM seasons WHERE id = ?').bind(id),
  ])
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
  const divisions = 'SELECT id FROM divisions WHERE phase_id = ?'
  const groups = `SELECT id FROM groups WHERE division_id IN (${divisions})`
  const teams = 'SELECT id FROM teams WHERE phase_id = ?'
  await db.batch([
    ...clearGroupsAndTeams(db, groups, teams, id),
    db.prepare(`DELETE FROM groups WHERE division_id IN (${divisions})`).bind(id),
    db.prepare('DELETE FROM divisions WHERE phase_id = ?').bind(id),
    // Points hang off the phase, not off a team (#384), so they outlive the
    // teams cleared just above and have to go with the phase itself.
    db.prepare('DELETE FROM player_phase_points WHERE phase_id = ?').bind(id),
    db.prepare('DELETE FROM phases WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// --- Divisions ---
app.post('/divisions', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier, competition_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(d.id, d.phaseId, d.displayName, d.rank, d.playersPerGame, d.isArchived ? 1 : 0, d.parentId ?? null, d.identifier ?? null, d.competitionId || null).run()
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
  if ('identifier' in p) { s.push('identifier = ?'); v.push(p.identifier ?? null) }
  // '' is how the form says "belongs to no competition" (#482).
  if ('competitionId' in p) { s.push('competition_id = ?'); v.push(p.competitionId || null) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE divisions SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// Delete division (archived only) — cascades: groups → teams → match days → games → availabilities → selections
app.delete('/divisions/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const groups = 'SELECT id FROM groups WHERE division_id = ?'
  const teams = `SELECT id FROM teams WHERE group_id IN (${groups})`
  await db.batch([
    ...clearGroupsAndTeams(db, groups, teams, id),
    db.prepare('DELETE FROM groups WHERE division_id = ?').bind(id),
    db.prepare('DELETE FROM divisions WHERE id = ?').bind(id),
  ])
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

// --- Competitions (#482) ---
//
// A competition is a general admin's decision, so these three routes refuse
// anybody else — `isGeneralAdmin` is declared with the onboarding routes below,
// and is called here at request time. Eligibility overrides, further down, are
// the club's half of the same feature and are scoped to the club they name.

/** Only category codes we know reach the column; anything else is dropped. */
const categoriesJson = (v: unknown): string => {
  const list = Array.isArray(v) ? v : []
  return JSON.stringify(list.filter((x): x is PlayerCategory =>
    typeof x === 'string' && (PLAYER_CATEGORIES as readonly string[]).includes(x)))
}

app.post('/competitions', async (c) => {
  if (!isGeneralAdmin(c)) return c.json({ error: 'not_allowed' }, 403)
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO competitions (id, display_name, categories, is_category_locked, sort_order, is_archived)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    d.id, d.displayName, categoriesJson(d.categories),
    d.isCategoryLocked ? 1 : 0, d.sortOrder ?? 0, d.isArchived ? 1 : 0,
  ).run()
  return c.json({ ok: true })
})

app.patch('/competitions/:id', async (c) => {
  if (!isGeneralAdmin(c)) return c.json({ error: 'not_allowed' }, 403)
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('displayName' in p) { s.push('display_name = ?'); v.push(p.displayName) }
  if ('categories' in p) { s.push('categories = ?'); v.push(categoriesJson(p.categories)) }
  if ('isCategoryLocked' in p) { s.push('is_category_locked = ?'); v.push(p.isCategoryLocked ? 1 : 0) }
  if ('sortOrder' in p) { s.push('sort_order = ?'); v.push(p.sortOrder) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if (s.length) {
    v.push(id)
    await c.env.DB.prepare(`UPDATE competitions SET ${s.join(', ')} WHERE id = ?`).bind(...v).run()
  }
  return c.json({ ok: true })
})

/**
 * Deleting a competition detaches its divisions rather than taking them with
 * it: a division outlives the championship it was filed under, and a phase's
 * calendar must not vanish because someone tidied a list. Its overrides go,
 * though — they name a competition that no longer exists.
 */
app.delete('/competitions/:id', async (c) => {
  if (!isGeneralAdmin(c)) return c.json({ error: 'not_allowed' }, 403)
  const db = c.env.DB
  const id = c.req.param('id')
  await db.batch([
    db.prepare('UPDATE divisions SET competition_id = NULL WHERE competition_id = ?').bind(id),
    db.prepare('DELETE FROM club_competition_eligibility WHERE competition_id = ?').bind(id),
    db.prepare('DELETE FROM competitions WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

/**
 * A club's amendment to one competition, for one licensee.
 *
 * `effect: 'default'` deletes the row — "put this player back where the global
 * mapping had them" is a third state, and it is the absence of a row rather
 * than a value.
 *
 * Two guards, both server-side because the browser's are only a courtesy:
 * the caller must administer the club named, and the player must belong to it;
 * and an `included` on a locked competition is refused outright, which is the
 * whole point of the lock — a youth championship does not admit a veteran
 * because a club asked nicely.
 */
app.put('/clubs/:clubId/competitions/:competitionId/eligibility', async (c) => {
  const db = c.env.DB
  const clubId = c.req.param('clubId')
  const competitionId = c.req.param('competitionId')
  const viewer = managingViewer(c)
  if (viewer.role !== 'general_admin' && !(viewer.role === 'club_admin' && viewer.clubId === clubId)) {
    return c.json({ error: 'not_allowed' }, 403)
  }
  const { playerId, effect } = await c.req.json<{ playerId?: string; effect?: string }>()
  if (!playerId || !['included', 'excluded', 'default'].includes(effect ?? '')) {
    return c.json({ error: 'bad_request' }, 400)
  }

  const player = await db
    .prepare('SELECT id, club_id, category FROM users WHERE id = ?')
    .bind(playerId)
    .first<Pick<UserRow, 'id' | 'club_id' | 'category'>>()
  if (!player || player.club_id !== clubId) return c.json({ error: 'not_in_club' }, 404)

  if (effect === 'default') {
    await db.prepare(
      'DELETE FROM club_competition_eligibility WHERE club_id = ? AND competition_id = ? AND player_id = ?',
    ).bind(clubId, competitionId, playerId).run()
    return c.json({ ok: true })
  }

  const competition = await db
    .prepare('SELECT id, categories, is_category_locked FROM competitions WHERE id = ?')
    .bind(competitionId)
    .first<Pick<CompetitionRow, 'id' | 'categories' | 'is_category_locked'>>()
  if (!competition) return c.json({ error: 'unknown_competition' }, 404)

  if (effect === 'included' && !canClubAdd(
    {
      categories: jsonParseCategories(competition.categories),
      isCategoryLocked: bool(competition.is_category_locked),
    },
    { id: player.id, category: player.category ?? undefined },
  )) {
    return c.json({ error: 'competition_locked' }, 409)
  }

  await db.prepare(
    `INSERT INTO club_competition_eligibility (club_id, competition_id, player_id, effect)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (club_id, competition_id, player_id) DO UPDATE SET effect = excluded.effect`,
  ).bind(clubId, competitionId, playerId, effect).run()
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
    'INSERT INTO groups (id, division_id, number, team_ids, is_archived, group_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(d.id, d.divisionId, d.number, jsonStr(d.teamIds ?? []), d.isArchived ? 1 : 0, d.groupId ?? null).run()
  return c.json({ ok: true })
})

app.patch('/groups/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []

  if ('number' in p) { s.push('number = ?'); v.push(p.number) }
  if ('teamIds' in p) { s.push('team_ids = ?'); v.push(jsonStr(p.teamIds)) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if ('groupId' in p) { s.push('group_id = ?'); v.push(p.groupId ?? null) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE groups SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
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
    await db.batch(clearGamesOfTeam(db, tid))
  }
  await db.batch([
    db.prepare('DELETE FROM teams WHERE group_id = ?').bind(id),
    ...clearGamesUnderMatchDays(db, 'SELECT id FROM match_days WHERE group_id = ?', id),
    db.prepare('DELETE FROM groups WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// Reset (#270): delete every journée/match of a group — and their
// availabilities/selections — without touching the group or its teams.
// Mirrors the match-day cascade from the group delete above, minus the
// group/team removal.
app.delete('/groups/:id/games', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  await db.batch(clearGamesUnderMatchDays(db, 'SELECT id FROM match_days WHERE group_id = ?', id))
  return c.json({ ok: true })
})

// Cascading deletes, set-based (#290).
//
// These used to loop: for each match day, select its games, then two DELETEs
// per game. A pool journée has four games, so clearing one group's calendar
// issued ~70 sequential D1 calls — past the Workers subrequest ceiling. The
// request died partway, silently: the early journées lost their games, the
// last ones kept theirs, and the final `DELETE FROM match_days` never ran.
// The client had already dropped everything from local state, so the UI
// looked right until a reload. Reported on Rixheim PPA 2 and 4, whose resets
// left J6-J7 and J5-J7 behind.
//
// Everything below is a fixed number of set-based statements in one batch,
// whatever the number of games — no loop, no per-row round trip, and the
// batch is atomic so a cascade can never again half-apply.

/**
 * Every deletion implied by removing a set of groups and a set of teams,
 * ordered so each subquery still resolves when its statement runs: leaves
 * first, and the tables the scoping subqueries read are dropped last.
 *
 * `groupIdsSql` and `teamIdsSql` each take exactly one bound parameter, which
 * `bind` supplies — the id of whatever is being deleted.
 */
function clearGroupsAndTeams(
  db: Env['Bindings']['DB'], groupIdsSql: string, teamIdsSql: string, bind: string,
) {
  const mdIds = `SELECT id FROM match_days WHERE group_id IN (${groupIdsSql})`
  const mdGameIds = `SELECT id FROM games WHERE match_day_id IN (${mdIds})`
  const teamGameIds =
    `SELECT id FROM games WHERE home_team_id IN (${teamIdsSql}) OR away_team_id IN (${teamIdsSql})`
  return [
    db.prepare(`DELETE FROM game_availabilities WHERE game_id IN (${mdGameIds})`).bind(bind),
    db.prepare(`DELETE FROM game_selections WHERE game_id IN (${mdGameIds})`).bind(bind),
    // A team of this scope can also appear in a game hanging off a match day
    // outside it; clear those before the teams disappear.
    db.prepare(`DELETE FROM game_availabilities WHERE game_id IN (${teamGameIds})`).bind(bind),
    db.prepare(`DELETE FROM game_selections WHERE game_id IN (${teamGameIds})`).bind(bind),
    db.prepare(`DELETE FROM games WHERE match_day_id IN (${mdIds})`).bind(bind),
    db.prepare(
      `DELETE FROM games WHERE home_team_id IN (${teamIdsSql}) OR away_team_id IN (${teamIdsSql})`,
    ).bind(bind),
    db.prepare(`DELETE FROM match_days WHERE group_id IN (${groupIdsSql})`).bind(bind),
    db.prepare(`DELETE FROM teams WHERE id IN (${teamIdsSql})`).bind(bind),
  ]
}

/**
 * Statements clearing every game — with its availabilities and selections —
 * under the match days selected by `mdIdsSql`, then those match days.
 * `mdIdsSql` must take exactly one bound parameter, which `bind` supplies.
 */
function clearGamesUnderMatchDays(db: Env['Bindings']['DB'], mdIdsSql: string, bind: string) {
  const gameIds = `SELECT id FROM games WHERE match_day_id IN (${mdIdsSql})`
  return [
    db.prepare(`DELETE FROM game_availabilities WHERE game_id IN (${gameIds})`).bind(bind),
    db.prepare(`DELETE FROM game_selections WHERE game_id IN (${gameIds})`).bind(bind),
    db.prepare(`DELETE FROM games WHERE match_day_id IN (${mdIdsSql})`).bind(bind),
    db.prepare(`DELETE FROM match_days WHERE id IN (${mdIdsSql})`).bind(bind),
  ]
}

/**
 * Statements removing a known list of games, with their availabilities and
 * selections (#422) — the imports' "this fixture is no longer played" path.
 *
 * Chunked at 90 ids: unlike the subquery-scoped helpers above, this binds one
 * parameter per id, and a whole poule's calendar is more than SQLite's
 * variable ceiling. Still a fixed number of set-based statements per chunk,
 * no per-game round trip (#290).
 */
function clearGamesByIds(db: Env['Bindings']['DB'], gameIds: string[]) {
  const stmts = []
  for (let i = 0; i < gameIds.length; i += 90) {
    const chunk = gameIds.slice(i, i + 90)
    const holes = chunk.map(() => '?').join(',')
    stmts.push(
      db.prepare(`DELETE FROM game_availabilities WHERE game_id IN (${holes})`).bind(...chunk),
      db.prepare(`DELETE FROM game_selections WHERE game_id IN (${holes})`).bind(...chunk),
      db.prepare(`DELETE FROM games WHERE id IN (${holes})`).bind(...chunk),
    )
  }
  return stmts
}

/** Statements deleting match days by id — for journées their last game just
 *  left (#422); their games must already be gone. */
function deleteMatchDaysByIds(db: Env['Bindings']['DB'], matchDayIds: string[]) {
  const stmts = []
  for (let i = 0; i < matchDayIds.length; i += 90) {
    const chunk = matchDayIds.slice(i, i + 90)
    stmts.push(
      db.prepare(`DELETE FROM match_days WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk),
    )
  }
  return stmts
}

/** Statements removing every game a team plays, with its availabilities and
 *  selections — used when the team itself goes away. */
function clearGamesOfTeam(db: Env['Bindings']['DB'], teamId: string) {
  const games = 'SELECT id FROM games WHERE home_team_id = ?1 OR away_team_id = ?1'
  return [
    db.prepare(`DELETE FROM game_availabilities WHERE game_id IN (${games})`).bind(teamId),
    db.prepare(`DELETE FROM game_selections WHERE game_id IN (${games})`).bind(teamId),
    db.prepare('DELETE FROM games WHERE home_team_id = ?1 OR away_team_id = ?1').bind(teamId),
  ]
}

// --- Players ---
// Players are users with is_player = 1 (see #105). These routes manage that row.

/**
 * A member with no address on file must land on NULL, never on '' (#315):
 * `users.email` is UNIQUE, so a second empty string would be rejected as a
 * duplicate, and an empty address would still count as one for lookups.
 */
const emailOrNull = (email: unknown): string | null =>
  typeof email === 'string' && email.trim() !== '' ? email.trim() : null

app.post('/players', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, category, status, club_id)
     VALUES (?, ?, 'player', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(d.id, emailOrNull(d.email), d.firstName, d.lastName, d.licenseNumber, d.phone ?? '', d.birthDate ?? null, d.birthPlace ?? null, d.category || null, d.status, d.clubId).run()
  return c.json({ ok: true })
})

app.patch('/players/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const s: string[] = [], v: unknown[] = []
  if ('firstName' in p) { s.push('first_name = ?'); v.push(p.firstName) }
  if ('lastName' in p) { s.push('last_name = ?'); v.push(p.lastName) }
  if ('licenseNumber' in p) { s.push('license_number = ?'); v.push(p.licenseNumber) }
  if ('email' in p) { s.push('email = ?'); v.push(emailOrNull(p.email)) }
  if ('phone' in p) { s.push('phone = ?'); v.push(p.phone) }
  if ('birthDate' in p) { s.push('birth_date = ?'); v.push(p.birthDate ?? null) }
  if ('birthPlace' in p) { s.push('birth_place = ?'); v.push(p.birthPlace ?? null) }
  // The FFTT code, verbatim (#482); '' is how the form says "no category".
  if ('category' in p) { s.push('category = ?'); v.push(p.category || null) }
  if ('status' in p) { s.push('status = ?'); v.push(p.status) }
  if ('clubId' in p) { s.push('club_id = ?'); v.push(p.clubId) }
  if (s.length) { v.push(id); await c.env.DB.prepare(`UPDATE users SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  return c.json({ ok: true })
})

// --- Club admins (#474) ---
// A club admin is `users.role = 'club_admin'` + `users.club_id`, not a row of
// its own — so these two routes are the whole feature. The rules they enforce
// (at most 5, never zero, who may appoint whom) live in src/lib/clubAdmins.ts
// and are shared verbatim with both club screens: the browser disables the
// button, and this decides.

/**
 * The viewer these routes judge against.
 *
 * `undefined` means AUTH_GUARD_DISABLED — the local-only escape hatch that
 * already serves the entire dataset to an unauthenticated caller (#138). The
 * same reasoning as `lastSeenVisibleTo` applies: refusing every appointment
 * there would hide the feature from local development and protect nothing, so
 * a missing viewer stands in as a general admin.
 */
const managingViewer = (c: { get: (k: 'user') => UserRow | undefined }) => {
  const u = c.get('user')
  return u ? { role: u.role, clubId: u.club_id ?? undefined } : { role: 'general_admin' }
}

/** Members shaped for the rules: role, club and status are all they read. */
async function clubAdminCandidates(db: D1Database) {
  const r = await db
    .prepare('SELECT id, role, club_id, status FROM users')
    .all<Pick<UserRow, 'id' | 'role' | 'club_id' | 'status'>>()
  return r.results.map((u) => ({
    id: u.id,
    role: u.role,
    clubId: u.club_id ?? undefined,
    status: u.status,
  }))
}

/**
 * A refusal, as an HTTP answer. `not_allowed` is the only 403: everything else
 * is a conflict with the club's current state, which the caller can act on.
 */
const refuse = (reason: AddRefusal | RemoveRefusal) =>
  ({ error: reason, message: refusalMessage(reason) }) as const

app.post('/clubs/:clubId/admins', async (c) => {
  const clubId = c.req.param('clubId')
  const db = c.env.DB
  const viewer = managingViewer(c)
  const body = await c.req.json<{
    userId?: string
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
  }>()

  const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(clubId).first()
  if (!club) return c.json({ error: 'club_not_found' }, 404)

  const users = await clubAdminCandidates(db)

  // Path 1: promote a member who already exists — a player of the club, or
  // someone invited earlier and stood down since.
  if (body.userId) {
    const candidate = users.find((u) => u.id === body.userId)
    if (!candidate) return c.json({ error: 'user_not_found' }, 404)
    const decision = canAddClubAdmin(users, clubId, candidate, viewer)
    if (!decision.ok) return c.json(refuse(decision.reason), decision.reason === 'not_allowed' ? 403 : 409)
    await db
      .prepare("UPDATE users SET role = 'club_admin', club_id = ? WHERE id = ?")
      .bind(clubId, body.userId)
      .run()
    return c.json({ ok: true, userId: body.userId })
  }

  // Path 2: invite someone who is not in the app at all — the secretary or
  // president with no licence. They are created as a member of the club who
  // does not play (is_player = 0), which is what makes them invisible to every
  // roster, availability and selection screen while still able to sign in.
  const email = emailOrNull(body.email)
  const firstName = (body.firstName ?? '').trim()
  const lastName = (body.lastName ?? '').trim()
  if (!email || !firstName || !lastName) return c.json({ error: 'invalid_request' }, 400)

  // The rules are asked about the person we are about to create, so both paths
  // meet the same cap and the same permission check.
  const fresh = { id: newId('user'), role: 'player', clubId: undefined, status: 'active' }
  const decision = canAddClubAdmin(users, clubId, fresh, viewer)
  if (!decision.ok) return c.json(refuse(decision.reason), decision.reason === 'not_allowed' ? 403 : 409)

  // `users.email` is UNIQUE and it is the sign-in identifier: a duplicate is a
  // different person's account, never a second one for this member.
  const taken = await db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
    .bind(email)
    .first()
  if (taken) return c.json(refuse('email_taken'), 409)

  await db
    .prepare(
      `INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, status, club_id)
       VALUES (?, ?, 'club_admin', 0, ?, ?, '', ?, NULL, NULL, 'active', ?)`,
    )
    .bind(fresh.id, email, firstName, lastName, (body.phone ?? '').trim(), clubId)
    .run()
  return c.json({ ok: true, userId: fresh.id })
})

app.delete('/clubs/:clubId/admins/:userId', async (c) => {
  const clubId = c.req.param('clubId')
  const userId = c.req.param('userId')
  const db = c.env.DB
  const users = await clubAdminCandidates(db)

  const decision = canRemoveClubAdmin(users, clubId, userId, managingViewer(c))
  if (!decision.ok) {
    const status = decision.reason === 'not_allowed' ? 403 : decision.reason === 'not_an_admin' ? 404 : 409
    return c.json(refuse(decision.reason), status)
  }

  // Back to 'player', which is the table's default and means "no special
  // authority" — is_player, club_id and status are untouched, so a promoted
  // player lands exactly where they started, with their licence, their roster
  // place and their availabilities intact.
  //
  // An invited non-licensee (is_player = 0) keeps their row too. Deleting a
  // person because their role changed is a larger action than "Retirer"
  // promises, and it is what makes re-appointing them later possible; they can
  // do nothing in the app until then.
  await db.prepare("UPDATE users SET role = 'player' WHERE id = ?").bind(userId).run()
  return c.json({ ok: true })
})

// --- Club admin requests (#474) ---
// The way in for a club the app has never heard of. POST is public — see
// authGuard.ts — because sign-in is passwordless and only mails a code to an
// address that already exists, so a correspondent discovering the app has no
// account to ask from and no way to obtain one. Reading and deciding are for
// general admins only.

interface ClubAdminRequestRow {
  id: string
  affiliation_number: string
  club_id: string | null
  email: string
  first_name: string
  last_name: string
  phone: string
  message: string
  fftt_snapshot: string
  license_number: string
  correspondent_email: string
  club_token_hash: string | null
  club_token_expires_at: number | null
  club_confirmed_at: number | null
  status: ClubAdminRequestStatus
  created_at: number
  decided_at: number | null
  decided_by: string | null
  decision_note: string | null
}

/** The snapshot as stored, tolerating a row written before a field existed. */
function parseSnapshot(json: string): ClubAdminRequestSnapshot {
  try {
    const v = JSON.parse(json) as Partial<ClubAdminRequestSnapshot>
    return {
      displayName: v.displayName ?? '',
      venue: v.venue ?? '',
      correspondentName: v.correspondentName ?? '',
      correspondentEmail: v.correspondentEmail ?? '',
      correspondentPhone: v.correspondentPhone ?? '',
    }
  } catch {
    return { displayName: '', venue: '', correspondentName: '', correspondentEmail: '', correspondentPhone: '' }
  }
}

const requestFromRow = (r: ClubAdminRequestRow): ClubAdminRequest => ({
  id: r.id,
  affiliationNumber: r.affiliation_number,
  ...(r.club_id ? { clubId: r.club_id } : {}),
  email: r.email,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  message: r.message,
  licenseNumber: r.license_number ?? '',
  correspondentEmail: r.correspondent_email ?? '',
  ...(r.club_confirmed_at ? { clubConfirmedAt: new Date(r.club_confirmed_at).toISOString() } : {}),
  snapshot: parseSnapshot(r.fftt_snapshot),
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  ...(r.decided_at ? { decidedAt: new Date(r.decided_at).toISOString() } : {}),
  ...(r.decided_by ? { decidedBy: r.decided_by } : {}),
  ...(r.decision_note ? { decisionNote: r.decision_note } : {}),
})

/** Only a general admin reads or decides. A missing viewer is the local hatch. */
const isGeneralAdmin = (c: { get: (k: 'user') => UserRow | undefined }) => {
  const u = c.get('user')
  return !u || u.role === 'general_admin'
}

/** A week: long enough for a club secretary who reads mail on Sundays. */
const CLUB_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Hashed like sessions (0041) and OTPs: the table never holds a usable link. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The deployment's own origin, for links inside e-mails. */
const originOf = (c: { req: { url: string } }) => new URL(c.req.url).origin

const summaryOf = (r: ClubAdminRequestRow): RequestSummary => ({
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  message: r.message,
  licenseNumber: r.license_number ?? '',
  affiliationNumber: r.affiliation_number,
  clubName: parseSnapshot(r.fftt_snapshot).displayName || r.affiliation_number,
})

/** Every general admin who can actually receive a message. */
async function generalAdminEmails(db: D1Database): Promise<string[]> {
  const r = await db
    .prepare("SELECT email FROM users WHERE role = 'general_admin' AND email IS NOT NULL AND email != ''")
    .all<{ email: string }>()
  return r.results.map((u) => u.email)
}

/**
 * Move a request to the general admins' queue and tell them.
 *
 * Called when the club confirms, and directly at submission when FFTT
 * publishes no correspondent to ask — a club with no listed address must not
 * be a club nobody can ever join.
 */
async function handOverToAdmins(
  c: { env: { DB: D1Database } & Record<string, unknown>; req: { url: string } },
  row: ClubAdminRequestRow,
  confirmedBy: string,
) {
  const env = c.env as Parameters<typeof sendEmails>[0]
  const queueUrl = `${originOf(c)}/demandes`
  const admins = await generalAdminEmails(c.env.DB)
  await sendEmails(
    env,
    admins.map((to) => newRequestForAdminEmail(to, summaryOf(row), confirmedBy, queueUrl)),
  )
}

// The public endpoint. Everything it accepts is untrusted, including the FFTT
// snapshot — the browser read that, not us.
app.post('/onboarding/requests', async (c) => {
  const db = c.env.DB
  const b = await c.req.json<{
    affiliationNumber?: string
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
    message?: string
    licenseNumber?: string
    snapshot?: Partial<ClubAdminRequestSnapshot>
  }>()

  const affiliationNumber = (b.affiliationNumber ?? '').trim()
  const email = (b.email ?? '').trim()
  const firstName = (b.firstName ?? '').trim()
  const lastName = (b.lastName ?? '').trim()

  const refuseRequest = (reason: keyof typeof REQUEST_REFUSAL_MESSAGES, status: 400 | 409 = 400) =>
    c.json({ error: reason, message: REQUEST_REFUSAL_MESSAGES[reason] }, status)

  if (!isValidAffiliationNumber(affiliationNumber)) return refuseRequest('invalid_affiliation')
  if (!firstName || !lastName) return refuseRequest('missing_name')
  if (!isPlausibleEmail(email)) return refuseRequest('invalid_email')
  const licenseNumber = (b.licenseNumber ?? '').trim()
  if (!isPlausibleLicenceNumber(licenseNumber)) return refuseRequest('invalid_licence')

  const clubId = clubIdFromAffiliation(affiliationNumber)

  // Asking for what one already has is a refusal worth naming: it tells the
  // requester to go and sign in rather than wait for a decision.
  if (clubId) {
    const existing = await db
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND role = 'club_admin' AND club_id = ?")
      .bind(email, clubId)
      .first()
    if (existing) return refuseRequest('already_admin', 409)
  }

  const pending = await db
    .prepare("SELECT id FROM club_admin_requests WHERE lower(email) = lower(?) AND affiliation_number = ? AND status IN ('pending_club', 'pending_admin')")
    .bind(email, affiliationNumber)
    .first()
  if (pending) return refuseRequest('already_pending', 409)

  // Free text from an anonymous form: bounded so a request cannot be used to
  // push a wall of content into an admin's screen.
  const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const snapshot: ClubAdminRequestSnapshot = {
    displayName: clip(b.snapshot?.displayName, 120),
    venue: clip(b.snapshot?.venue, 240),
    correspondentName: clip(b.snapshot?.correspondentName, 120),
    correspondentEmail: clip(b.snapshot?.correspondentEmail, 160),
    correspondentPhone: clip(b.snapshot?.correspondentPhone, 40),
  }

  const id = newId('req')
  // A club we already know is linked straight away, so the review screen can
  // show what it would be joining rather than only a number.
  const knownClub = clubId
    ? await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(clubId).first()
    : null

  // Where the club confirmation goes. Claimant-supplied — the server cannot
  // read the FFTT listing itself — so this is recorded, not trusted: the review
  // screen compares it against what FFTT publishes at decision time, which is
  // what catches a requester who put their own address in as the club's.
  const correspondentEmail = isPlausibleEmail(snapshot.correspondentEmail)
    ? snapshot.correspondentEmail
    : ''
  // A club FFTT lists no address for cannot confirm, and must not therefore be
  // a club nobody can ever join: it goes straight to the admins, labelled.
  const status: ClubAdminRequestStatus = correspondentEmail ? 'pending_club' : 'pending_admin'
  const token = correspondentEmail ? randomToken() : null

  const row: ClubAdminRequestRow = {
    id, affiliation_number: affiliationNumber, club_id: knownClub ? clubId : null,
    email, first_name: clip(firstName, 80), last_name: clip(lastName, 80),
    phone: clip(b.phone, 40), message: clip(b.message, 500),
    fftt_snapshot: JSON.stringify(snapshot), license_number: licenseNumber,
    correspondent_email: correspondentEmail, club_token_hash: null,
    club_token_expires_at: null, club_confirmed_at: null,
    status, created_at: Date.now(), decided_at: null, decided_by: null, decision_note: null,
  }

  await db
    .prepare(
      `INSERT INTO club_admin_requests
         (id, affiliation_number, club_id, email, first_name, last_name, phone, message,
          fftt_snapshot, license_number, correspondent_email, club_token_hash,
          club_token_expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id, row.affiliation_number, row.club_id, row.email, row.first_name, row.last_name,
      row.phone, row.message, row.fftt_snapshot, row.license_number, row.correspondent_email,
      token ? await hashToken(token) : null,
      token ? Date.now() + CLUB_TOKEN_TTL_MS : null,
      row.status, row.created_at,
    )
    .run()

  if (token) {
    const confirmUrl = `${originOf(c)}/confirmer-demande?token=${token}`
    await sendEmails(c.env, [clubConfirmationEmail(correspondentEmail, summaryOf(row), confirmUrl)])
  } else {
    await handOverToAdmins(c, row, '')
  }

  // Deliberately says nothing about the club or the queue: this answer reaches
  // anyone who can type an affiliation number. `clubNotified` is the one thing
  // the requester needs — whether to expect their club to be asked — and it
  // reveals nothing they did not just submit themselves.
  return c.json({ ok: true, clubNotified: Boolean(token) })
})

/**
 * The club's step, and the only thing a correspondent ever touches. Public and
 * addressed by token — they have no account, and giving them one to click a
 * link would defeat the point.
 *
 * GET reads the request behind a token so the page can show what is being
 * confirmed; POST confirms it. A token that has been used, has expired, or
 * never existed is one answer — "ce lien n'est plus valable" — because
 * distinguishing them tells a guesser which of their guesses was close.
 */
async function requestByToken(db: D1Database, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const row = await db
    .prepare("SELECT * FROM club_admin_requests WHERE club_token_hash = ? AND status = 'pending_club'")
    .bind(await hashToken(token))
    .first<ClubAdminRequestRow>()
  if (!row) return null
  if (row.club_token_expires_at && row.club_token_expires_at < Date.now()) return null
  return row
}

app.get('/onboarding/confirm', async (c) => {
  const row = await requestByToken(c.env.DB, c.req.query('token') ?? '')
  if (!row) return c.json({ error: 'invalid_token' }, 404)
  const snapshot = parseSnapshot(row.fftt_snapshot)
  // Only what the correspondent needs to recognise the person asking. Not the
  // queue, not other requests, not who else administers the club.
  return c.json({
    clubName: snapshot.displayName || row.affiliation_number,
    affiliationNumber: row.affiliation_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    licenseNumber: row.license_number ?? '',
    message: row.message,
  })
})

app.post('/onboarding/confirm', async (c) => {
  const { token } = await c.req.json<{ token?: string }>()
  const row = await requestByToken(c.env.DB, token ?? '')
  if (!row) return c.json({ error: 'invalid_token' }, 404)

  const now = Date.now()
  await c.env.DB
    .prepare(
      `UPDATE club_admin_requests
       SET status = 'pending_admin', club_confirmed_at = ?, club_token_hash = NULL
       WHERE id = ?`,
    )
    .bind(now, row.id)
    .run()

  // The token is spent, not merely expired: a confirmation link that still
  // works after it has been used is a link worth stealing.
  await handOverToAdmins(c, { ...row, club_confirmed_at: now }, row.correspondent_email)
  return c.json({ ok: true })
})

app.get('/onboarding/requests', async (c) => {
  if (!isGeneralAdmin(c)) return c.json({ error: 'forbidden' }, 403)
  const r = await c.env.DB
    .prepare('SELECT * FROM club_admin_requests ORDER BY created_at DESC')
    .all<ClubAdminRequestRow>()
  return c.json({ requests: r.results.map(requestFromRow) })
})

/**
 * Decide a request. Approving creates the club when it does not exist yet,
 * taking its name and venue from what the general admin confirmed, then makes
 * the requester an admin of it — reusing the same cap and permission rules the
 * club screens obey, so a club already holding 5 admins refuses here too.
 */
app.patch('/onboarding/requests/:id', async (c) => {
  if (!isGeneralAdmin(c)) return c.json({ error: 'forbidden' }, 403)
  const db = c.env.DB
  const id = c.req.param('id')
  const b = await c.req.json<{
    status?: 'approved' | 'rejected'
    note?: string
    /** The club as the admin confirmed it against FFTT; used only on creation. */
    club?: { displayName?: string; venueLabel?: string; street?: string; postalCode?: string; city?: string }
  }>()

  if (b.status !== 'approved' && b.status !== 'rejected') return c.json({ error: 'invalid_status' }, 400)

  const row = await db
    .prepare('SELECT * FROM club_admin_requests WHERE id = ?')
    .bind(id)
    .first<ClubAdminRequestRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.status === 'pending_club') return c.json({ error: 'awaiting_club' }, 409)
  if (row.status !== 'pending_admin') return c.json({ error: 'already_decided' }, 409)

  const decidedBy = c.get('user')?.id ?? null
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : null

  // Both parties hear the outcome (#474): the person who asked, and the club
  // address the confirmation went to. Deduplicated, because on a small club
  // they are often the same person, who should not get it twice.
  const loginUrl = `${originOf(c)}/login`
  const notify = (decision: 'approved' | 'rejected') => {
    // Compared case-insensitively: addresses are, and on a small club the
    // correspondent and the requester are frequently the same person writing
    // their own address two different ways.
    const seen = new Set<string>()
    const recipients = [row.email, row.correspondent_email].filter((a) => {
      const key = (a ?? '').trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    return sendEmails(
      c.env,
      recipients.map((to) => decisionEmail(to, summaryOf(row), decision, note ?? '', loginUrl)),
    )
  }

  if (b.status === 'rejected') {
    await db
      .prepare("UPDATE club_admin_requests SET status = 'rejected', decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ?")
      .bind(Date.now(), decidedBy, note, id)
      .run()
    await notify('rejected')
    return c.json({ ok: true })
  }

  const clubId = clubIdFromAffiliation(row.affiliation_number)
  if (!clubId) return c.json({ error: 'invalid_affiliation' }, 400)

  const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(clubId).first()
  let createdClub = false
  if (!club) {
    const snapshot = parseSnapshot(row.fftt_snapshot)
    const displayName = (b.club?.displayName ?? snapshot.displayName ?? '').trim() || row.affiliation_number
    await db
      .prepare('INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES (?, ?, ?, 0)')
      .bind(clubId, row.affiliation_number, displayName)
      .run()
    createdClub = true
    // The venue comes from the FFTT record the admin just confirmed, not from
    // anything the requester typed into the form.
    const street = (b.club?.street ?? '').trim()
    const postalCode = (b.club?.postalCode ?? '').trim()
    const city = (b.club?.city ?? '').trim()
    if (street || postalCode || city) {
      await db
        .prepare('INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .bind(newId('addr'), clubId, (b.club?.venueLabel ?? '').trim() || 'Salle', street, postalCode, city)
        .run()
    }
  }

  // Promote an existing member, or create the requester as one who does not
  // play — the same two paths POST /clubs/:id/admins takes, held to the same
  // rules so the cap cannot be walked around through this door.
  const users = await clubAdminCandidates(db)
  const licence = (row.license_number ?? '').trim()

  // Licence before address: it is the identity FFTT and the app agree on, and
  // the one case where the two differ is exactly the one worth catching — a
  // licensee asking from an address the club has never recorded for them.
  const existing =
    (licence
      ? await db
          .prepare("SELECT id, role, club_id, status FROM users WHERE license_number = ? AND license_number != ''")
          .bind(licence)
          .first<Pick<UserRow, 'id' | 'role' | 'club_id' | 'status'>>()
      : null) ??
    (await db
      .prepare('SELECT id, role, club_id, status FROM users WHERE lower(email) = lower(?)')
      .bind(row.email)
      .first<Pick<UserRow, 'id' | 'role' | 'club_id' | 'status'>>())

  const candidate = existing
    ? { id: existing.id, role: existing.role, clubId: existing.club_id ?? undefined, status: existing.status }
    : { id: newId('user'), role: 'player', clubId: undefined, status: 'active' }

  const decision = canAddClubAdmin(users, clubId, candidate, { role: 'general_admin' })
  if (!decision.ok) {
    // The club may have just been created for a request that cannot complete;
    // say so plainly rather than leaving a half-done approval looking like a
    // success.
    return c.json({ ...refuse(decision.reason), createdClub }, 409)
  }

  if (existing) {
    // Only ever fills a blank: an existing licence is the club's record and is
    // not overwritten by something typed into a public form.
    await db
      .prepare(
        `UPDATE users
         SET role = 'club_admin', club_id = ?,
             license_number = CASE WHEN license_number = '' THEN ? ELSE license_number END,
             is_player = CASE WHEN license_number = '' AND ? != '' THEN 1 ELSE is_player END
         WHERE id = ?`,
      )
      .bind(clubId, licence, licence, existing.id)
      .run()
  } else {
    // A licence makes them a player from the outset — which is the whole point
    // of asking for it. Created as a non-player, a licensee is invisible to the
    // FFTT player import, which matches on licence: it would find nothing and
    // insert the same person a second time (#474). Given the licence here, the
    // import finds them and fills in the rest.
    await db
      .prepare(
        `INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, status, club_id)
         VALUES (?, ?, 'club_admin', ?, ?, ?, ?, ?, NULL, NULL, 'active', ?)`,
      )
      .bind(
        candidate.id, row.email, licence ? 1 : 0, row.first_name, row.last_name,
        licence, row.phone, clubId,
      )
      .run()
  }

  await db
    .prepare("UPDATE club_admin_requests SET status = 'approved', club_id = ?, decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ?")
    .bind(clubId, Date.now(), decidedBy, note, id)
    .run()

  await notify('approved')
  return c.json({ ok: true, clubId, userId: candidate.id, createdClub })
})

// --- Player avatars (#124) ---
// Images are stored base64 in D1 and served here so the bulk /api/data payload
// stays light (it only carries avatarUpdatedAt for cache-busting).
app.get('/users/:id/avatar', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB
    .prepare('SELECT data, content_type, updated_at FROM user_avatars WHERE user_id = ?')
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

app.put('/users/:id/avatar', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json() as { data?: string; contentType?: string }
  if (!body.data) return c.json({ error: 'missing data' }, 400)
  const updatedAt = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO user_avatars (user_id, data, content_type, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data = excluded.data, content_type = excluded.content_type, updated_at = excluded.updated_at`
  ).bind(id, body.data, body.contentType ?? 'image/jpeg', updatedAt).run()
  return c.json({ ok: true, avatarUpdatedAt: updatedAt })
})

app.delete('/users/:id/avatar', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM user_avatars WHERE user_id = ?').bind(id).run()
  return c.json({ ok: true })
})

// --- Teams ---
app.post('/teams', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived, team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    d.id, d.clubId, d.phaseId, d.number, d.groupId,
    d.gameLocationId, d.defaultDay, d.defaultTime, d.captainId ?? '',
    jsonStr(d.playerIds ?? []),
    d.color ?? null, d.whatsappLink ?? null, d.isArchived ? 1 : 0, d.teamId ?? null,
  ).run()
  return c.json({ ok: true })
})

/**
 * Keep `groups.team_ids` in step when a team changes pool (#422). That list is
 * what the app reads as a poule's composition — a move that only rewrote
 * `teams.group_id` would leave the team listed in the poule it left and
 * missing from the one it joined.
 */
async function syncGroupMembership(db: Env['Bindings']['DB'], teamId: string, groupId: string) {
  const rows = await db.prepare('SELECT id, team_ids FROM groups').all()
  const stmts = []
  for (const g of rows.results) {
    const teamIds = jsonParseIds(g.team_ids)
    const shouldHold = g.id === groupId
    if (shouldHold === teamIds.includes(teamId)) continue
    const next = shouldHold ? [...teamIds, teamId] : teamIds.filter((t) => t !== teamId)
    stmts.push(db.prepare('UPDATE groups SET team_ids = ? WHERE id = ?').bind(jsonStr(next), g.id))
  }
  return stmts
}

/**
 * The fixtures a team leaves behind when it changes pool (#422) — the
 * repêchage case, where it keeps its roster, its captain and its history but
 * plays somewhere else.
 *
 * They are matches it will not play, and their availabilities and
 * compositions answer a question that no longer exists, so they go. Journées
 * of the old pool left with no game at all go too. Everything else — the old
 * pool's other fixtures, the team row itself — is untouched.
 */
async function clearTeamGamesOutsideGroup(
  db: Env['Bindings']['DB'], teamId: string, previousGroupId: string, groupId: string,
) {
  const doomed = await db.prepare(
    `SELECT id FROM games WHERE (home_team_id = ?1 OR away_team_id = ?1)
     AND match_day_id IN (SELECT id FROM match_days WHERE group_id <> ?2)`,
  ).bind(teamId, groupId).all()
  const deletedGames = doomed.results.map((g) => g.id as string)
  if (deletedGames.length) await db.batch(clearGamesByIds(db, deletedGames))
  const emptied = await db.prepare(
    `SELECT id FROM match_days WHERE group_id = ?
     AND NOT EXISTS (SELECT 1 FROM games WHERE games.match_day_id = match_days.id)`,
  ).bind(previousGroupId).all()
  const deletedMatchDays = emptied.results.map((m) => m.id as string)
  if (deletedMatchDays.length) await db.batch(deleteMatchDaysByIds(db, deletedMatchDays))
  return { deletedGames, deletedMatchDays }
}

app.patch('/teams/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const db = c.env.DB
  // A pool change is a move, not a field edit (#422) — read the pool the team
  // is in before the update, so the work below only runs when it differs.
  const movingTo = typeof p.groupId === 'string' && p.groupId ? p.groupId : null
  const previousGroupId = movingTo
    ? (await db.prepare('SELECT group_id FROM teams WHERE id = ?').bind(id)
        .first<{ group_id: string }>())?.group_id ?? null
    : null
  const s: string[] = [], v: unknown[] = []
  if ('clubId' in p) { s.push('club_id = ?'); v.push(p.clubId) }
  if ('phaseId' in p) { s.push('phase_id = ?'); v.push(p.phaseId) }
  if ('number' in p) { s.push('number = ?'); v.push(p.number) }
  // No divisionId: the column was dropped in migration 0031 and the division
  // is derived from the group (#282). Writing it here was a hard failure.
  if ('groupId' in p) { s.push('group_id = ?'); v.push(p.groupId) }
  if ('gameLocationId' in p) { s.push('game_location_id = ?'); v.push(p.gameLocationId) }
  if ('defaultDay' in p) { s.push('default_day = ?'); v.push(p.defaultDay) }
  if ('defaultTime' in p) { s.push('default_time = ?'); v.push(p.defaultTime) }
  if ('captainId' in p) { s.push('captain_id = ?'); v.push(p.captainId) }
  if ('playerIds' in p) { s.push('player_ids = ?'); v.push(jsonStr(p.playerIds)) }
  if ('color' in p) { s.push('color = ?'); v.push(p.color ?? null) }
  if ('whatsappLink' in p) { s.push('whatsapp_link = ?'); v.push(p.whatsappLink ?? null) }
  if ('isArchived' in p) { s.push('is_archived = ?'); v.push(p.isArchived ? 1 : 0) }
  if (s.length) { v.push(id); await db.prepare(`UPDATE teams SET ${s.join(', ')} WHERE id = ?`).bind(...v).run() }
  if (movingTo && previousGroupId && previousGroupId !== movingTo) {
    const membership = await syncGroupMembership(db, id, movingTo)
    if (membership.length) await db.batch(membership)
    return c.json({ ok: true, ...(await clearTeamGamesOutsideGroup(db, id, previousGroupId, movingTo)) })
  }
  return c.json({ ok: true })
})

// Delete team (archived only) — removes from group teamIds, cascades availabilities/selections
app.delete('/teams/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Remove team from group's team_ids
  const groupsR = await db.prepare('SELECT id, team_ids FROM groups').all()
  for (const g of groupsR.results) {
    const teamIds = jsonParseIds(g.team_ids)
    if (teamIds.includes(id)) {
      await db.prepare('UPDATE groups SET team_ids = ? WHERE id = ?')
        .bind(jsonStr(teamIds.filter(t => t !== id)), g.id).run()
    }
  }
  await db.batch([
    ...clearGamesOfTeam(db, id),
    db.prepare('DELETE FROM teams WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// Batch update teams (used for player conflict resolution)
app.post('/teams/batch', async (c) => {
  const { updates } = await c.req.json()
  if (!updates?.length) return c.json({ ok: true })
  const stmts = updates.map((u: { id: string; playerIds: string[] }) =>
    c.env.DB.prepare('UPDATE teams SET player_ids = ? WHERE id = ?')
      .bind(jsonStr(u.playerIds), u.id)
  )
  await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

// --- Player phase points (#384) ---
// Points belong to (phase, player), not to a team, and the FFTT import is
// their only writer — hence a batch upsert rather than per-field PATCHes: one
// import writes the whole club at once.
app.post('/player-phase-points/batch', async (c) => {
  const { updates } = await c.req.json() as {
    updates?: Array<{ phaseId: string; playerId: string; points: string }>
  }
  if (!updates?.length) return c.json({ ok: true })
  await c.env.DB.batch(updates.map((u) =>
    c.env.DB.prepare(
      `INSERT INTO player_phase_points (phase_id, player_id, points) VALUES (?, ?, ?)
       ON CONFLICT(phase_id, player_id) DO UPDATE SET points = excluded.points`
    ).bind(u.phaseId, u.playerId, u.points)
  ))
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
  const db = c.env.DB
  await db.prepare(
    'INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time, date, game_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(d.id, d.matchDayId, d.homeTeamId, d.awayTeamId, d.time ?? null, d.date ?? null, d.gameId ?? null).run()
  await recomputeMatchDayDate(db, d.matchDayId)
  return c.json({ ok: true })
})

app.patch('/games/:id', async (c) => {
  const id = c.req.param('id')
  const p = await c.req.json()
  const db = c.env.DB
  const s: string[] = [], v: unknown[] = []
  if ('matchDayId' in p) { s.push('match_day_id = ?'); v.push(p.matchDayId) }
  if ('homeTeamId' in p) { s.push('home_team_id = ?'); v.push(p.homeTeamId) }
  if ('awayTeamId' in p) { s.push('away_team_id = ?'); v.push(p.awayTeamId) }
  if ('time' in p) { s.push('time = ?'); v.push(p.time ?? null) }
  if ('date' in p) { s.push('date = ?'); v.push(p.date ?? null) }
  // Changing a slot by hand is a decision, not an import (#294): mark it so no
  // later import overwrites it, and so the UI can show it was negotiated.
  if ('time' in p || 'date' in p) { s.push("source = 'manual'") }
  if (!s.length) return c.json({ ok: true })
  // A date (or a match-day move) can shift the derived date of whichever
  // match_day(s) this game belongs to before/after — capture the prior one
  // so both are recomputed, not just the new one.
  let oldMatchDayId: string | null = null
  if ('date' in p || 'matchDayId' in p) {
    const row = await db.prepare('SELECT match_day_id FROM games WHERE id = ?').bind(id).first<{ match_day_id: string }>()
    oldMatchDayId = row?.match_day_id ?? null
  }
  v.push(id)
  await db.prepare(`UPDATE games SET ${s.join(', ')} WHERE id = ?`).bind(...v).run()
  if (oldMatchDayId) {
    await recomputeMatchDayDate(db, oldMatchDayId)
    if (typeof p.matchDayId === 'string' && p.matchDayId !== oldMatchDayId) await recomputeMatchDayDate(db, p.matchDayId)
  }
  return c.json({ ok: true })
})

// --- Game Availabilities ---
app.post('/game-availabilities/set', async (c) => {
  const d = await c.req.json()
  await c.env.DB.prepare(
    `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(game_id, player_id) DO UPDATE SET status = excluded.status, overridden_by = excluded.overridden_by`
  ).bind(d.gameId, d.playerId, d.status, d.overriddenBy ?? null).run()
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
    // (game_id, team_id) is the primary key since 0033 (#282), so the old
    // select-then-update-or-insert dance collapses into one upsert.
    await c.env.DB.prepare(
      `INSERT INTO game_selections (game_id, team_id, player_ids) VALUES (?, ?, ?)
       ON CONFLICT(game_id, team_id) DO UPDATE SET player_ids = excluded.player_ids`
    ).bind(d.gameId, d.teamId, jsonStr(d.playerIds)).run()
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
      await c.env.DB.prepare(
        `INSERT INTO game_selections (game_id, team_id, player_ids) VALUES (?, ?, ?)
         ON CONFLICT(game_id, team_id) DO UPDATE SET player_ids = excluded.player_ids`
      ).bind(d.gameId, d.teamId, jsonStr(d.playerIds)).run()
    }
  }
  return c.json({ ok: true })
})

export const onRequest = handle(app)
