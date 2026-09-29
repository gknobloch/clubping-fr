import { Hono } from 'hono'
import type { Env } from './auth'
import { fetchReceipts, isExpoPushToken, sendPushes, type OutgoingPush, type PushTicket } from './push'
import { jsonParseIds, trainingFromRow, type TrainingRow, type TrainingSessionRow } from './rows'
import type { AvailabilityStatus, MemberGroup, TrainingKind } from '../../src/types'
import {
  mergePreferences, parsePreferences, resolveNotificationPreferences, sanitizePreferencesPatch,
  type NotificationCategory, type NotificationPreferences,
} from '../../src/lib/notificationPreferences'
import {
  TRAINING_CANCELLED, TRAINING_REMINDER, TRAINING_REMINDER_HORIZON_DAYS,
  cancellationsDue, categoryOfTraining, expectedMemberIds, occurrenceKey, trainingCancelledPush,
  trainingOccurrences, trainingReminderPush, trainingRemindersDue, trainingSentKey,
  type DueTrainingNotification, type OccurrenceAudience, type TrainingLabels, type TrainingMember,
} from '../../src/lib/trainings'
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
 * The member's own switches — their own, and nobody else's.
 *
 * Not a field of PATCH /players/:id, which is the form a club admin fills in
 * about someone. Whether a phone rings is a decision for the person holding
 * it, so this reads the session and never takes an id.
 *
 * Two halves, either or both: `enabled`, the master switch every build since
 * #495 sends, and `categories` (#608), a partial per-category change merged
 * into what the member already chose. A body carrying neither is refused.
 */
notificationsApp.patch('/preferences', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json<{ enabled?: unknown; categories?: unknown }>()
  const hasEnabled = typeof body.enabled === 'boolean'
  const patch = sanitizePreferencesPatch(body.categories)
  const hasCategories = Object.keys(patch).length > 0
  if (!hasEnabled && !hasCategories) return c.json({ error: 'invalid_params' }, 400)
  if (hasEnabled) {
    await c.env.DB.prepare('UPDATE users SET notifications_enabled = ? WHERE id = ?')
      .bind(body.enabled ? 1 : 0, user.id).run()
  }
  let stored = parsePreferences(user.notification_preferences)
  if (hasCategories) {
    // Read again rather than trusted from the session's row: two switches
    // flicked in quick succession must not have the second undo the first.
    const row = await c.env.DB.prepare('SELECT notification_preferences FROM users WHERE id = ?')
      .bind(user.id).first<{ notification_preferences: string | null }>()
    stored = mergePreferences(parsePreferences(row?.notification_preferences ?? null), patch)
    await c.env.DB.prepare('UPDATE users SET notification_preferences = ? WHERE id = ?')
      .bind(JSON.stringify(stored), user.id).run()
  }
  return c.json({
    ok: true,
    ...(hasEnabled ? { enabled: body.enabled } : {}),
    notificationPreferences: stored,
  })
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
  /** Reminders put back on the table because none of their deliveries arrived. */
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
  const matches = await dispatchAvailabilityRequests(c.env, today)
  const trainings = await dispatchTrainingNotifications(c.env, today)
  return c.json({ ...matches, trainings })
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

  const tokens = await tokensByUser(db, 'match')
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
// Training reminders (#608)
// ---------------------------------------------------------------------------

interface TrainingDispatchReport {
  /** Sessions inside the horizon, cancelled ones included. */
  sessions: number
  reminders: number
  cancellations: number
}

interface MemberRow {
  id: string
  club_id: string | null
  is_player: number
  status: string
  notification_preferences: string | null
}

/**
 * Remind whoever is expected at a training session inside their own lead time,
 * and tell whoever was counting on a session that it is off.
 *
 * The same ledger as the matches (#495), under two more kinds, with the
 * occurrence key (`training@date`) in the `game_id` column: a reminder goes out
 * once per member and session, and so does a cancellation. What is new is that
 * the window is each member's own — so the sweep looks as far ahead as anyone
 * may choose, and `trainingRemindersDue` decides per member.
 *
 * Runs after the match sweep, which has already collected yesterday's receipts
 * — a training reminder that never arrived has had its ledger row taken back
 * by then, and is due again below.
 */
export async function dispatchTrainingNotifications(
  env: Env['Bindings'],
  today: string,
): Promise<TrainingDispatchReport> {
  const db = env.DB
  const report: TrainingDispatchReport = { sessions: 0, reminders: 0, cancellations: 0 }
  const until = addDays(today, TRAINING_REMINDER_HORIZON_DAYS)

  const trainingRows = (await db.prepare('SELECT * FROM trainings').all<TrainingRow>()).results
  if (!trainingRows.length) return report
  const sessionRows = (await db.prepare(
    'SELECT * FROM training_sessions WHERE date BETWEEN ? AND ?',
  ).bind(today, until).all<TrainingSessionRow>()).results

  const occurrences = trainingOccurrences(
    trainingRows.map(trainingFromRow),
    sessionRows.map((r) => ({
      trainingId: r.training_id, date: r.date, cancelled: r.cancelled === 1,
      ...(r.note ? { note: r.note } : {}),
    })),
    today,
    until,
  )
  report.sessions = occurrences.length
  if (!occurrences.length) return report

  const clubIds = [...new Set(occurrences.map((o) => o.training.clubId))]
  const [members, groups, places] = await Promise.all([
    clubMembers(db, clubIds),
    clubMemberGroups(db, clubIds),
    clubPlaces(db, clubIds),
  ])
  const preferences = new Map<string, NotificationPreferences>(
    members.map((m) => [m.id, resolveNotificationPreferences(parsePreferences(m.notification_preferences))]),
  )
  const defaults = resolveNotificationPreferences(null)
  const preferencesOf = (userId: string) => preferences.get(userId) ?? defaults
  const asMembers: TrainingMember[] = members.map((m) => ({
    id: m.id, clubId: m.club_id ?? undefined, isPlayer: m.is_player === 1, status: m.status,
  }))

  const audiences: OccurrenceAudience[] = []
  const labels = new Map<string, TrainingLabels>()
  for (const o of occurrences) {
    const key = occurrenceKey(o.training.id, o.date)
    audiences.push({
      key, kind: o.training.kind, date: o.date, cancelled: o.cancelled,
      memberIds: expectedMemberIds(o.training, groups, asMembers),
    })
    const place = placeOf(places, o.training.clubId, o.training.addressId)
    labels.set(key, {
      trainingId: o.training.id, kind: o.training.kind, displayName: o.training.displayName,
      date: o.date, startTime: o.training.startTime,
      ...(place ? { place } : {}),
      ...(o.note ? { note: o.note } : {}),
    })
  }

  const keys = audiences.map((a) => a.key)
  const reminded = await ledgerRows(db, TRAINING_REMINDER, keys)
  const remindedKeys = new Set(reminded.map((r) => trainingSentKey(r.user_id, r.game_id)))
  const reminders = trainingRemindersDue(audiences, preferencesOf, today, remindedKeys)

  // Who was counting on each cancelled session: reminded of it, or said they
  // were coming. Not everyone expected — see `cancellationsDue`.
  const cancelledKeys = audiences.filter((a) => a.cancelled).map((a) => a.key)
  let cancellations: DueTrainingNotification[] = []
  if (cancelledKeys.length) {
    const counting = new Map<string, Set<string>>()
    const add = (key: string, userId: string) =>
      counting.set(key, (counting.get(key) ?? new Set()).add(userId))
    const wanted = new Set(cancelledKeys)
    for (const r of reminded) if (wanted.has(r.game_id)) add(r.game_id, r.user_id)
    const coming = await db.prepare(
      `SELECT training_id, date, player_id FROM training_availabilities
        WHERE status IN ('available', 'maybe') AND date BETWEEN ? AND ?`,
    ).bind(today, until).all<{ training_id: string; date: string; player_id: string }>()
    for (const r of coming.results) {
      const key = occurrenceKey(r.training_id, r.date)
      if (wanted.has(key)) add(key, r.player_id)
    }
    const told = new Set(
      (await ledgerRows(db, TRAINING_CANCELLED, cancelledKeys)).map((r) => trainingSentKey(r.user_id, r.game_id)),
    )
    cancellations = cancellationsDue(audiences, counting, preferencesOf, today, told)
  }
  if (!reminders.length && !cancellations.length) return report

  const kindOf = new Map(audiences.map((a) => [a.key, a.kind]))
  const send = async (
    kind: string,
    due: DueTrainingNotification[],
    message: (l: TrainingLabels) => PushMessage,
  ) => {
    const messages: OutgoingPush[] = []
    const notified: Array<{ userId: string; gameId: string }> = []
    for (const trainingKind of ['guided', 'regular'] as TrainingKind[]) {
      const mine = due.filter((d) => kindOf.get(d.key) === trainingKind)
      if (!mine.length) continue
      const tokens = await tokensByUser(db, categoryOfTraining(trainingKind), mine.map((d) => d.userId))
      for (const d of mine) {
        const deviceTokens = tokens.get(d.userId)
        const l = labels.get(d.key)
        // No device: nothing recorded either, as for a match — installing the
        // app on Monday still brings Tuesday's reminder.
        if (!deviceTokens?.length || !l) continue
        const m = message(l)
        const ref = { kind, userId: d.userId, gameId: d.key }
        for (const to of deviceTokens) messages.push({ to, ...m, ref })
        notified.push({ userId: d.userId, gameId: d.key })
      }
    }
    if (!messages.length) return 0
    const delivery = await sendPushes(env, messages)
    await recordSent(db, kind, notified)
    await pruneTokens(db, delivery.invalidTokens)
    await recordTickets(db, delivery.tickets)
    return notified.length
  }

  report.reminders = await send(TRAINING_REMINDER, reminders, (l) => trainingReminderPush(l, today))
  report.cancellations = await send(TRAINING_CANCELLED, cancellations, trainingCancelledPush)
  return report
}

/** The members of these clubs, with what they want pushed. */
async function clubMembers(db: D1Database, clubIds: string[]): Promise<MemberRow[]> {
  const out: MemberRow[] = []
  for (const chunk of chunked(clubIds)) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(
      `SELECT id, club_id, is_player, status, notification_preferences FROM users WHERE club_id IN (${holes})`,
    ).bind(...chunk).all<MemberRow>()
    out.push(...r.results)
  }
  return out
}

/** These clubs' member groups (#602), memberships folded in. */
async function clubMemberGroups(db: D1Database, clubIds: string[]): Promise<MemberGroup[]> {
  const byId = new Map<string, MemberGroup>()
  for (const chunk of chunked(clubIds)) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(
      `SELECT g.id AS id, g.club_id AS club_id, g.display_name AS display_name, m.user_id AS user_id
         FROM member_groups g
         LEFT JOIN member_group_members m ON m.group_id = g.id
        WHERE g.club_id IN (${holes})`,
    ).bind(...chunk).all<{ id: string; club_id: string; display_name: string; user_id: string | null }>()
    for (const row of r.results) {
      const g = byId.get(row.id) ?? { id: row.id, clubId: row.club_id, displayName: row.display_name, memberIds: [] }
      if (row.user_id) g.memberIds.push(row.user_id)
      byId.set(row.id, g)
    }
  }
  return [...byId.values()]
}

interface PlaceRow {
  id: string
  club_id: string
  label: string | null
  city: string | null
  is_default: number
}

async function clubPlaces(db: D1Database, clubIds: string[]): Promise<PlaceRow[]> {
  const out: PlaceRow[] = []
  for (const chunk of chunked(clubIds)) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(
      `SELECT id, club_id, label, city, is_default FROM club_addresses WHERE club_id IN (${holes})`,
    ).bind(...chunk).all<PlaceRow>()
    out.push(...r.results)
  }
  return out
}

/**
 * Where a session is, in the few words a notification has room for: the
 * address the training names, else the club's default — its label if it has
 * one, its city otherwise.
 */
function placeOf(places: PlaceRow[], clubId: string, addressId: string | undefined): string | undefined {
  const own = places.filter((p) => p.club_id === clubId)
  const a = (addressId && own.find((p) => p.id === addressId)) || own.find((p) => p.is_default === 1) || own[0]
  return a ? (a.label || a.city || undefined) : undefined
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
    await pushTo(env, 'match', captains, message)
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
async function pushTo(
  env: Env['Bindings'],
  category: NotificationCategory,
  userIds: string[],
  message: PushMessage,
) {
  const tokens = await tokensByUser(env.DB, category, userIds)
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

interface TokenRow {
  token: string
  user_id: string
  notification_preferences?: string | null
}

/**
 * The devices to ring, per member, with anyone who switched notifications off
 * already dropped — the master switch, and the category this message belongs
 * to (#608). Both are enforced here rather than at each call site, and the
 * category is a required argument, so no future sender can forget either.
 */
async function tokensByUser(
  db: D1Database,
  category: NotificationCategory,
  userIds?: string[],
): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>()
  const collect = (rows: TokenRow[]) => {
    for (const r of rows) {
      if (!resolveNotificationPreferences(parsePreferences(r.notification_preferences))[category].enabled) continue
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.token])
    }
  }
  const base =
    `SELECT p.token AS token, p.user_id AS user_id, u.notification_preferences AS notification_preferences
       FROM push_tokens p
       JOIN users u ON u.id = p.user_id
      WHERE u.notifications_enabled = 1`
  if (!userIds) {
    const r = await db.prepare(base).all<TokenRow>()
    collect(r.results)
    return byUser
  }
  for (const chunk of chunked([...new Set(userIds)])) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(`${base} AND p.user_id IN (${holes})`)
      .bind(...chunk).all<TokenRow>()
    collect(r.results)
  }
  return byUser
}

/** The ledger's rows of one kind, for these matches (or training sessions). */
async function ledgerRows(
  db: D1Database,
  kind: string,
  gameIds: string[],
): Promise<Array<{ user_id: string; game_id: string }>> {
  const rows: Array<{ user_id: string; game_id: string }> = []
  for (const chunk of chunked(gameIds)) {
    const holes = chunk.map(() => '?').join(',')
    const r = await db.prepare(
      `SELECT user_id, game_id FROM notifications_sent
        WHERE kind = ? AND game_id IN (${holes})`,
    ).bind(kind, ...chunk).all<{ user_id: string; game_id: string }>()
    rows.push(...r.results)
  }
  return rows
}

/** Which (member, match) pairs have already been told, for these matches. */
async function sentLedger(
  db: D1Database,
  kind: string,
  gameIds: string[],
): Promise<Set<string>> {
  return new Set((await ledgerRows(db, kind, gameIds)).map((row) => sentKey(row.user_id, row.game_id)))
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
 *   ledger row, and it was the member's ONLY way of being told, that row is
 *   deleted: the member was never told, so the reminder is owed again, and
 *   today's sweep — which runs after this — will send it. A token the
 *   platform says is gone is deleted too, which is what stops a permanently
 *   dead device from being retried for seven days.
 * - **pending** — Expo has nothing yet. Left alone, and abandoned once it is
 *   older than the window Expo keeps receipts in.
 *
 * "Only way" is the point of the per-reminder grouping below. A ticket is per
 * DEVICE, the ledger per MEMBER: one reminder to a member with a phone and a
 * tablet is two tickets under one ledger row. Undoing the row because one of
 * them failed re-sent the reminder to every device the next evening — the one
 * that had received it included — and again the evening after, for as long
 * as the failing device kept failing and the match stayed inside the window.
 * So a reminder is put back only when none of its deliveries arrived, and not
 * while one of them is still pending: that one decides on a later run.
 *
 * The grouping sees one run's rows. All the tickets of one send are filed
 * together and Expo settles them within minutes, so a day later they are
 * answered together; a sibling that was already settled by an earlier run
 * would need a receipt to take a whole day longer than the others.
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
  // Per reminder (kind, member, match): the ones with a failed delivery, and
  // the ones with a delivery that arrived or may still arrive.
  const failedRefs = new Map<string, { kind: string; userId: string; gameId: string }>()
  const reachedRefs = new Set<string>()
  const refKey = (r: PendingRow) =>
    r.kind && r.user_id && r.game_id ? `${r.kind} ${sentKey(r.user_id, r.game_id)}` : null
  const cutoff = Date.now() - RECEIPT_TTL_MS

  for (const row of rows.results) {
    const verdict = verdicts.get(row.ticket_id) ?? { status: 'pending' as const }
    const ref = refKey(row)
    if (verdict.status === 'pending') {
      if (row.queued_at < cutoff) {
        report.expired += 1
        settled.push(row.ticket_id)
      } else {
        report.pending += 1
        if (ref) reachedRefs.add(ref)
      }
      continue
    }
    report.checked += 1
    settled.push(row.ticket_id)
    if (verdict.status === 'ok') {
      report.delivered += 1
      if (ref) reachedRefs.add(ref)
      continue
    }
    report.failed += 1
    console.error(
      `[push] non livré (${verdict.error ?? 'sans code'}) : ${verdict.platform ?? verdict.message ?? 'sans détail'}`,
    )
    if (verdict.error === 'DeviceNotRegistered') deadTokens.add(row.token)
    if (ref && row.kind && row.user_id && row.game_id) {
      failedRefs.set(ref, { kind: row.kind, userId: row.user_id, gameId: row.game_id })
    }
  }

  const requeue = [...failedRefs].filter(([ref]) => !reachedRefs.has(ref)).map(([, e]) => e)
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
