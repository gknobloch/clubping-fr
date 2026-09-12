import { Hono } from 'hono'
import type { Env } from './auth'
import { fetchReceipts, isExpoPushToken, sendPushes, type OutgoingPush, type PushTicket } from './push'
import { jsonParseIds } from './rows'
import type { AvailabilityStatus } from '../../src/types'
import {
  AVAILABILITY_REQUEST,
  AVAILABILITY_WINDOW_DAYS,
  availabilityChangePush,
  availabilityRequestPush,
  availabilityRequestsDue,
  captainsToAlert,
  sentKey,
  type GameLabels,
  type GameSquad,
  type PushMessage,
} from '../../src/lib/pushNotifications'

/**
 * The push endpoints and the daily sweep (#495).
 *
 * Kept out of [[path]].ts — which is long enough — and mounted like authApp.
 * What lives here is everything that has to touch D1; the rules it applies are
 * in src/lib/pushNotifications.ts, with no database in the way.
 */
export const notificationsApp = new Hono<Env>()

// ---------------------------------------------------------------------------
// Registration — one device saying "I will take these"
// ---------------------------------------------------------------------------

// A missing viewer is refused here, unlike `lastSeenVisibleTo` and
// `managingViewer` in [[path]].ts, which stand a general admin in for the
// AUTH_GUARD_DISABLED escape hatch. Those answer "what may this person see?",
// and hiding a feature from local development protects nothing. These three
// answer "whose phone is this?" — a question with no sensible default. A token
// registered for nobody is a token nothing will ever send to, and a preference
// saved for nobody is saved nowhere.

/**
 * Record a device's Expo token against the signed-in member.
 *
 * Upsert on the token, not on (member, token): a club phone handed to the next
 * captain re-registers the SAME token under a new member, and only replacing
 * the row moves it. Otherwise the previous holder keeps receiving the club's
 * notifications on a phone they no longer have.
 *
 * The app calls this on every launch, not only the first: iOS reissues a token
 * after a restore or a reinstall, and `last_seen_at` is how an abandoned
 * install becomes visible.
 */
notificationsApp.post('/push-tokens', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const { token, platform } = await c.req.json<{ token?: unknown; platform?: unknown }>()
  if (!isExpoPushToken(token)) return c.json({ error: 'invalid_token' }, 400)
  const os = platform === 'ios' || platform === 'android' ? platform : 'unknown'
  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO push_tokens (token, user_id, platform, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       platform = excluded.platform,
       last_seen_at = excluded.last_seen_at`,
  ).bind(token, user.id, os, now, now).run()
  return c.json({ ok: true })
})

/**
 * Forget a device's token — what logging out does.
 *
 * Deliberately keyed on the token alone and not on the session's member: the
 * row may already have been reassigned to whoever signed in on that phone
 * since, and in that case there is nothing here to delete anyway. What must
 * never happen is a signed-out phone still ringing, and deleting the token
 * settles that whoever it currently belongs to.
 */
notificationsApp.post('/push-tokens/forget', async (c) => {
  const { token } = await c.req.json<{ token?: unknown }>()
  if (!isExpoPushToken(token)) return c.json({ error: 'invalid_token' }, 400)
  await c.env.DB.prepare('DELETE FROM push_tokens WHERE token = ?').bind(token).run()
  return c.json({ ok: true })
})

/**
 * The member's own switch — their own, and nobody else's.
 *
 * Not a field of PATCH /players/:id, which is the form a club admin fills in
 * about someone. Whether a phone rings is a decision for the person holding
 * it, so this reads the session and never takes an id.
 */
notificationsApp.patch('/preferences', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const { enabled } = await c.req.json<{ enabled?: unknown }>()
  if (typeof enabled !== 'boolean') return c.json({ error: 'invalid_params' }, 400)
  await c.env.DB.prepare('UPDATE users SET notifications_enabled = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, user.id).run()
  return c.json({ ok: true, enabled })
})

// ---------------------------------------------------------------------------
// The daily sweep
// ---------------------------------------------------------------------------

interface DispatchReport {
  /** Matches inside the window that had at least one squad. */
  games: number
  /** Members owed a push, before tokens and preferences are consulted. */
  due: number
  sent: number
  prunedTokens: number
  /** What the PREVIOUS run turned out to have actually delivered. */
  receipts: ReceiptReport
}

interface ReceiptReport {
  /** Handles Expo gave a verdict on. */
  checked: number
  delivered: number
  /** Refused by the platform — each one logged with the reason it gave. */
  failed: number
  /** Reminders put back on the table because they never arrived. */
  requeued: number
  /** Still waiting on Expo, or abandoned after a day of waiting. */
  pending: number
  expired: number
}

/**
 * Ask every squad of every near match for their availability, once each.
 *
 * Authenticated by a shared secret rather than a session, because there is
 * nobody at the keyboard: Pages Functions have no cron trigger, so this is
 * called from .github/workflows/notify.yml. An environment with no
 * NOTIFY_SECRET has no such endpoint at all — 404, not 401 — so a preview
 * cannot be talked into notifying a real club by someone who finds the URL.
 */
notificationsApp.post('/dispatch', async (c) => {
  const secret = c.env.NOTIFY_SECRET
  if (!secret) return c.json({ error: 'not_found' }, 404)
  const presented = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!timingSafeEqual(presented, secret)) return c.json({ error: 'unauthorized' }, 401)
  // `today` is overridable so the suite can put a fixed day in front of it;
  // the workflow never sends one.
  const body = await c.req.json<{ today?: unknown }>().catch(() => ({ today: undefined }))
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10)
  return c.json(await dispatchAvailabilityRequests(c.env, today))
})

/** Constant-time compare, so a wrong secret cannot be found one byte at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface SquadRow {
  game_id: string
  date: string
  team_id: string
  player_ids: string
  home_team_id: string
  team_label: string
  opponent_label: string | null
}

export async function dispatchAvailabilityRequests(
  env: Env['Bindings'],
  today: string,
): Promise<DispatchReport> {
  const db = env.DB
  const until = addDays(today, AVAILABILITY_WINDOW_DAYS)

  // Before deciding anything new, find out what the last run actually did.
  // This is deliberately first: a reminder it turns out never arrived is put
  // back on the table in time for the sweep below to send it again today.
  const receipts = await collectReceipts(env)

  // One query for the whole window: every fixture whose date falls in it, once
  // per side, with both team names resolved. A team's own club may field both
  // sides of a fixture, and both squads are then asked — they are two squads.
  const squadRows = await db.prepare(
    `SELECT g.id AS game_id,
            COALESCE(g.date, md.date) AS date,
            t.id AS team_id,
            t.player_ids AS player_ids,
            g.home_team_id AS home_team_id,
            COALESCE(c.display_name || ' ' || t.number, 'Équipe ' || t.number) AS team_label,
            COALESCE(oc.display_name || ' ' || o.number, NULL) AS opponent_label
       FROM games g
       JOIN match_days md ON md.id = g.match_day_id
       JOIN teams t ON t.id IN (g.home_team_id, g.away_team_id)
       JOIN teams o ON o.id = CASE WHEN t.id = g.home_team_id THEN g.away_team_id ELSE g.home_team_id END
       LEFT JOIN clubs c ON c.id = t.club_id
       LEFT JOIN clubs oc ON oc.id = o.club_id
      WHERE t.is_archived = 0
        AND COALESCE(g.date, md.date) BETWEEN ? AND ?`,
  ).bind(today, until).all<SquadRow>()

  const squads: GameSquad[] = squadRows.results.map((r) => ({
    gameId: r.game_id,
    date: r.date,
    playerIds: jsonParseIds(r.player_ids),
  }))
  if (!squads.length) return { games: 0, due: 0, sent: 0, prunedTokens: 0, receipts }

  // What each (member, match) pair should say, indexed once rather than
  // searched per recipient — a club with eight teams reaches this table often.
  const labelsByGameTeam = new Map<string, GameLabels>()
  const teamOfPlayer = new Map<string, string>()
  for (const r of squadRows.results) {
    labelsByGameTeam.set(`${r.game_id}:${r.team_id}`, {
      gameId: r.game_id,
      date: r.date,
      teamLabel: r.team_label,
      opponentLabel: r.opponent_label,
      isHome: r.team_id === r.home_team_id,
    })
    for (const playerId of jsonParseIds(r.player_ids)) {
      teamOfPlayer.set(`${r.game_id}:${playerId}`, r.team_id)
    }
  }

  const gameIds = [...new Set(squads.map((s) => s.gameId))]
  const alreadySent = await sentLedger(db, AVAILABILITY_REQUEST, gameIds)
  const due = availabilityRequestsDue(squads, today, alreadySent)
  if (!due.length) return { games: gameIds.length, due: 0, sent: 0, prunedTokens: 0, receipts }

  const tokens = await tokensByUser(db)
  const messages: OutgoingPush[] = []
  const notified: Array<{ userId: string; gameId: string }> = []
  for (const d of due) {
    const deviceTokens = tokens.get(d.userId)
    // No device, or the member turned notifications off: nothing is recorded
    // either, so installing the app on Thursday still brings Saturday's ask.
    if (!deviceTokens?.length) continue
    const teamId = teamOfPlayer.get(`${d.gameId}:${d.userId}`)
    const labels = teamId ? labelsByGameTeam.get(`${d.gameId}:${teamId}`) : undefined
    if (!labels) continue
    const message = availabilityRequestPush(labels, today)
    const ref = { kind: AVAILABILITY_REQUEST, userId: d.userId, gameId: d.gameId }
    for (const to of deviceTokens) messages.push({ to, ...message, ref })
    notified.push(d)
  }

  const delivery = await sendPushes(env, messages)
  await recordSent(db, AVAILABILITY_REQUEST, notified)
  await pruneTokens(db, delivery.invalidTokens)
  // "sent" still means accepted by Expo, which is not delivered — tomorrow's
  // run is what turns these handles into a verdict.
  await recordTickets(db, delivery.tickets)
  return {
    games: gameIds.length,
    due: due.length,
    sent: notified.length,
    prunedTokens: delivery.invalidTokens.length,
    receipts,
  }
}

// ---------------------------------------------------------------------------
// A change of mind, while it still matters
// ---------------------------------------------------------------------------

/**
 * Tell the captain that somebody who had answered has answered differently.
 *
 * Called from POST /game-availabilities/set, which is where web and mobile
 * both write and the only place that sees the old value next to the new one.
 * It is deliberately not called for a first answer: filling the grid in is the
 * expected reply to the daily sweep, and a captain pushed eight times the
 * evening a reminder goes out stops reading the ninth — which is the one that
 * says somebody dropped out.
 *
 * Never throws. The availability is already recorded and the caller cannot
 * undo it because a push failed.
 */
export async function notifyAvailabilityChange(
  env: Env['Bindings'],
  args: {
    gameId: string
    playerId: string
    from: AvailabilityStatus
    to: AvailabilityStatus
    actorId: string | null
    today: string
  },
): Promise<void> {
  try {
    const context = await gameContext(env.DB, args.gameId)
    if (!context) return
    if (!withinWindow(context.date, args.today)) return

    const captains = captainsToAlert(context.teams, args.playerId, args.actorId)
    if (!captains.length) return

    const team = context.teams.find((t) => t.playerIds.includes(args.playerId))
    if (!team) return
    const labels = context.labels.get(team.id)
    if (!labels) return

    const name = await playerName(env.DB, args.playerId)
    const selected = await isSelected(env.DB, args.gameId, team.id, args.playerId)
    const message = availabilityChangePush(labels, name, args.from, args.to, selected)
    await pushTo(env, captains, message)
  } catch (e) {
    console.error('[push] changement de dispo non notifié', e)
  }
}

function withinWindow(date: string, today: string): boolean {
  const until = addDays(today, AVAILABILITY_WINDOW_DAYS)
  return date >= today && date <= until
}

interface GameContext {
  date: string
  teams: Array<{ id: string; captainId: string; playerIds: string[] }>
  labels: Map<string, GameLabels>
}

/** One fixture, both sides, with names — what any message about it needs. */
async function gameContext(db: D1Database, gameId: string): Promise<GameContext | null> {
  const rows = await db.prepare(
    `SELECT g.id AS game_id,
            COALESCE(g.date, md.date) AS date,
            t.id AS team_id,
            t.captain_id AS captain_id,
            t.player_ids AS player_ids,
            g.home_team_id AS home_team_id,
            COALESCE(c.display_name || ' ' || t.number, 'Équipe ' || t.number) AS team_label,
            COALESCE(oc.display_name || ' ' || o.number, NULL) AS opponent_label
       FROM games g
       JOIN match_days md ON md.id = g.match_day_id
       JOIN teams t ON t.id IN (g.home_team_id, g.away_team_id)
       JOIN teams o ON o.id = CASE WHEN t.id = g.home_team_id THEN g.away_team_id ELSE g.home_team_id END
       LEFT JOIN clubs c ON c.id = t.club_id
       LEFT JOIN clubs oc ON oc.id = o.club_id
      WHERE g.id = ?`,
  ).bind(gameId).all<SquadRow & { captain_id: string }>()
  if (!rows.results.length) return null

  const labels = new Map<string, GameLabels>()
  const teams = rows.results.map((r) => {
    labels.set(r.team_id, {
      gameId: r.game_id,
      date: r.date,
      teamLabel: r.team_label,
      opponentLabel: r.opponent_label,
      isHome: r.team_id === r.home_team_id,
    })
    return { id: r.team_id, captainId: r.captain_id, playerIds: jsonParseIds(r.player_ids) }
  })
  return { date: rows.results[0].date, teams, labels }
}

/**
 * Whether the line-up already saved for this team names the licensee.
 *
 * Read at the moment the change happens rather than left to the captain to go
 * and check: the whole point of the alert is that nobody reopens the screen.
 * A team with no line-up yet has no row at all, which is "not selected".
 */
async function isSelected(
  db: D1Database,
  gameId: string,
  teamId: string,
  playerId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT player_ids FROM game_selections WHERE game_id = ? AND team_id = ?')
    .bind(gameId, teamId).first<{ player_ids: string }>()
  return row ? jsonParseIds(row.player_ids).includes(playerId) : false
}

async function playerName(db: D1Database, playerId: string): Promise<string> {
  const row = await db.prepare('SELECT first_name, last_name FROM users WHERE id = ?')
    .bind(playerId).first<{ first_name: string | null; last_name: string | null }>()
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim()
  return name || 'Un joueur'
}

/** Send one message to several members, on every device each of them has. */
async function pushTo(env: Env['Bindings'], userIds: string[], message: PushMessage) {
  const tokens = await tokensByUser(env.DB, userIds)
  const messages: OutgoingPush[] = []
  for (const userId of userIds) {
    for (const to of tokens.get(userId) ?? []) messages.push({ to, ...message })
  }
  if (!messages.length) return
  const delivery = await sendPushes(env, messages)
  await pruneTokens(env.DB, delivery.invalidTokens)
  // No ref: a captain alert keeps no ledger, so a failed receipt has nothing
  // to put back — but it is still worth knowing it failed.
  await recordTickets(env.DB, delivery.tickets)
}

// ---------------------------------------------------------------------------
// D1 helpers
// ---------------------------------------------------------------------------

/** Never bind more than this in one statement — D1 caps a query's variables. */
const BIND_CHUNK = 80

const chunked = <T>(items: T[], size = BIND_CHUNK): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * The devices to ring, per member, with anyone who switched notifications off
 * already dropped — the preference is enforced here rather than at each call
 * site so no future sender can forget it.
 */
async function tokensByUser(
  db: D1Database,
  userIds?: string[],
): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>()
  const collect = (rows: Array<{ token: string; user_id: string }>) => {
    for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.token])
  }
  const base =
    `SELECT p.token AS token, p.user_id AS user_id
       FROM push_tokens p
       JOIN users u ON u.id = p.user_id
      WHERE u.notifications_enabled = 1`
  if (!userIds) {
    const r = await db.prepare(base).all<{ token: string; user_id: string }>()
    collect(r.results)
    return byUser
  }
  for (const chunk of chunked([...new Set(userIds)])) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(`${base} AND p.user_id IN (${holes})`)
      .bind(...chunk).all<{ token: string; user_id: string }>()
    collect(r.results)
  }
  return byUser
}

/** Which (member, match) pairs have already been told, for these matches. */
async function sentLedger(
  db: D1Database,
  kind: string,
  gameIds: string[],
): Promise<Set<string>> {
  const sent = new Set<string>()
  for (const chunk of chunked(gameIds)) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(
      `SELECT user_id, game_id FROM notifications_sent
        WHERE kind = ? AND game_id IN (${holes})`,
    ).bind(kind, ...chunk).all<{ user_id: string; game_id: string }>()
    for (const row of r.results) sent.add(sentKey(row.user_id, row.game_id))
  }
  return sent
}

async function recordSent(
  db: D1Database,
  kind: string,
  notified: Array<{ userId: string; gameId: string }>,
) {
  if (!notified.length) return
  const now = Date.now()
  for (const chunk of chunked(notified, 25)) {
    await db.batch(
      chunk.map((n) =>
        db.prepare(
          `INSERT INTO notifications_sent (kind, user_id, game_id, sent_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(kind, user_id, game_id) DO NOTHING`,
        ).bind(kind, n.userId, n.gameId, now),
      ),
    )
  }
}

/**
 * How long a handle is worth asking about. Expo keeps receipts roughly a day;
 * past that the answer will never come, and the row is dead weight.
 */
const RECEIPT_TTL_MS = 36 * 60 * 60 * 1000

/** File the handles a send came back with, for the next run to follow up on. */
async function recordTickets(db: D1Database, tickets: PushTicket[]) {
  if (!tickets.length) return
  const now = Date.now()
  for (const chunk of chunked(tickets, 25)) {
    await db.batch(
      chunk.map((t) =>
        db.prepare(
          `INSERT INTO push_receipts (ticket_id, token, kind, user_id, game_id, queued_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(ticket_id) DO NOTHING`,
        ).bind(t.id, t.to, t.ref?.kind ?? null, t.ref?.userId ?? null, t.ref?.gameId ?? null, now),
      ),
    )
  }
}

interface PendingRow {
  ticket_id: string
  token: string
  kind: string | null
  user_id: string | null
  game_id: string | null
  queued_at: number
}

/**
 * Read the verdicts on everything the previous runs accepted.
 *
 * The three outcomes are acted on differently, and the difference is the whole
 * point:
 *
 * - **ok** — the row has served its purpose and goes.
 * - **error** — logged with the platform's own words, because that sentence is
 *   the only thing that ever names the cause. If the delivery was backing a
 *   ledger row, that row is deleted: the member was never told, so the
 *   reminder is owed again, and today's sweep — which runs after this — will
 *   send it. A token the platform says is gone is deleted too, which is what
 *   stops a permanently dead device from being retried for seven days.
 * - **pending** — Expo has nothing yet. Left alone, and abandoned once it is
 *   older than the window Expo keeps receipts in.
 */
async function collectReceipts(env: Env['Bindings']): Promise<ReceiptReport> {
  const db = env.DB
  const report: ReceiptReport = {
    checked: 0, delivered: 0, failed: 0, requeued: 0, pending: 0, expired: 0,
  }
  const rows = await db.prepare(
    'SELECT ticket_id, token, kind, user_id, game_id, queued_at FROM push_receipts ORDER BY queued_at LIMIT 1000',
  ).all<PendingRow>()
  if (!rows.results.length) return report

  const verdicts = await fetchReceipts(env, rows.results.map((r) => r.ticket_id))
  const settled: string[] = []
  const deadTokens = new Set<string>()
  const requeue: Array<{ kind: string; userId: string; gameId: string }> = []
  const cutoff = Date.now() - RECEIPT_TTL_MS

  for (const row of rows.results) {
    const verdict = verdicts.get(row.ticket_id) ?? { status: 'pending' as const }
    if (verdict.status === 'pending') {
      if (row.queued_at < cutoff) {
        report.expired += 1
        settled.push(row.ticket_id)
      } else {
        report.pending += 1
      }
      continue
    }
    report.checked += 1
    settled.push(row.ticket_id)
    if (verdict.status === 'ok') {
      report.delivered += 1
      continue
    }
    report.failed += 1
    console.error(
      `[push] non livré (${verdict.error ?? 'sans code'}) : ${verdict.platform ?? verdict.message ?? 'sans détail'}`,
    )
    if (verdict.error === 'DeviceNotRegistered') deadTokens.add(row.token)
    if (row.kind && row.user_id && row.game_id) {
      requeue.push({ kind: row.kind, userId: row.user_id, gameId: row.game_id })
    }
  }

  await forgetLedger(db, requeue)
  report.requeued = requeue.length
  await pruneTokens(db, [...deadTokens])
  await settleReceipts(db, settled)
  return report
}

/** Take back the "already told them" for a reminder that never arrived. */
async function forgetLedger(
  db: D1Database,
  entries: Array<{ kind: string; userId: string; gameId: string }>,
) {
  if (!entries.length) return
  for (const chunk of chunked(entries, 25)) {
    await db.batch(
      chunk.map((e) =>
        db.prepare(
          'DELETE FROM notifications_sent WHERE kind = ? AND user_id = ? AND game_id = ?',
        ).bind(e.kind, e.userId, e.gameId),
      ),
    )
  }
}

async function settleReceipts(db: D1Database, ticketIds: string[]) {
  if (!ticketIds.length) return
  for (const chunk of chunked(ticketIds)) {
    const holes = chunk.map(() => '?').join(',')
    await db.prepare(`DELETE FROM push_receipts WHERE ticket_id IN (${holes})`).bind(...chunk).run()
  }
}

/** Drop the tokens Expo told us are gone — nothing else ever will. */
async function pruneTokens(db: D1Database, tokens: string[]) {
  if (!tokens.length) return
  for (const chunk of chunked(tokens)) {
    const holes = chunk.map(() => '?').join(',')
    await db.prepare(`DELETE FROM push_tokens WHERE token IN (${holes})`).bind(...chunk).run()
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
