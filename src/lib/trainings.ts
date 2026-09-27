import type {
  Address, AvailabilityStatus, Club, MemberGroup, Training, TrainingAvailability, TrainingKind, TrainingSession, User,
} from '../types'
import type { NotificationCategory, NotificationPreferences } from './notificationPreferences'
import { daysUntil, inDays, longDate, type PushMessage } from './pushNotifications'
import { mayManageMemberGroups } from './memberGroups'
import type { MatchEvent } from './calendar'
import { formatAddress } from './address'

// ---------------------------------------------------------------------------
// A club's collective trainings (#608)
//
// The one place that turns a training series into dates, says who is expected
// at one, and decides who is owed a reminder. Shared by the web
// (`@/lib/trainings`), the app (`@shared/lib/trainings`) and the API's daily
// sweep. Pure: no network, no context.
// ---------------------------------------------------------------------------

export const TRAINING_KIND_LABELS: Record<TrainingKind, string> = {
  guided: 'Entraînement dirigé',
  regular: 'Entraînement libre',
}

/** Plural, for section headings and the preference screen. */
export const TRAINING_KIND_PLURALS: Record<TrainingKind, string> = {
  guided: 'Entraînements dirigés',
  regular: 'Entraînements libres',
}

/** ISO weekday → name, index 1 (lundi) to 7 (dimanche). */
export const WEEKDAY_NAMES = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** The notification category a training's reminders belong to. */
export const categoryOfTraining = (kind: TrainingKind): NotificationCategory =>
  kind === 'guided' ? 'training_guided' : 'training_regular'

/** Only a guided session asks who is coming; a regular slot is just there. */
export const asksForAnswer = (kind: TrainingKind) => kind === 'guided'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

export const isTime = (s: unknown): s is string => typeof s === 'string' && TIME.test(s)

/** A civil date moved by whole days. Computed in UTC so no timezone shifts it. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ISO weekday of a civil date: 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

/** "20:00" → "20h", "20:30" → "20h30" — how the app writes a match time. */
export function formatTime(time: string | undefined): string {
  if (!time || !isTime(time)) return time ?? ''
  const [h, m] = time.split(':')
  return `${Number(h)}h${m === '00' ? '' : m}`
}

/** "20h – 22h", or the start alone. */
export function formatTimeRange(training: Pick<Training, 'startTime' | 'endTime'>): string {
  const start = formatTime(training.startTime)
  return training.endTime ? `${start} – ${formatTime(training.endTime)}` : start
}

/** "Tous les mardis, 20h – 22h" — a regular slot in one line. */
export function recurrenceLabel(training: Training): string {
  if (training.kind !== 'regular' || !training.weekday) return formatTimeRange(training)
  return `Tous les ${WEEKDAY_NAMES[training.weekday]}s, ${formatTimeRange(training)}`
}

/**
 * Where a training takes place: the address it names, else the club's default
 * (or first) one — the same fallback a home match uses (`getVenueAddress`).
 */
export function trainingAddress(training: Pick<Training, 'clubId' | 'addressId'>, clubs: Club[]): Address | undefined {
  const addresses = clubs.find((c) => c.id === training.clubId)?.addresses ?? []
  return (training.addressId && addresses.find((a) => a.id === training.addressId))
    || addresses.find((a) => a.isDefault)
    || addresses[0]
}

/** The place in a few words — the address's label, or its city. */
export const placeLabel = (a: Address | undefined) => (a ? a.label || a.city : undefined)

/**
 * A coach's weekly run of dates, from the first to `until` inclusive — how a
 * guided schedule is entered in one go, then trimmed date by date. Capped, so
 * a mistyped year cannot produce a thousand sessions.
 */
export function weeklyDates(first: string, until?: string, max = 52): string[] {
  if (!isIsoDate(first)) return []
  if (!until || !isIsoDate(until) || until < first) return [first]
  const out: string[] = []
  for (let d = first; d <= until && out.length < max; d = addDays(d, 7)) out.push(d)
  return out
}

// ---------------------------------------------------------------------------
// Series → dates
// ---------------------------------------------------------------------------

/** One date of one training, whatever kind of series it came from. */
export interface TrainingOccurrence {
  training: Training
  date: string
  cancelled: boolean
  note?: string
}

/**
 * The one string that names an occurrence — the ledger's `game_id` column,
 * a push's routing key. A date cannot contain `@`, so splitting on the last
 * one is unambiguous whatever the id looks like.
 */
export const occurrenceKey = (trainingId: string, date: string) => `${trainingId}@${date}`

export function parseOccurrenceKey(key: string): { trainingId: string; date: string } | null {
  const at = key.lastIndexOf('@')
  if (at <= 0) return null
  const date = key.slice(at + 1)
  return isIsoDate(date) ? { trainingId: key.slice(0, at), date } : null
}

/** How far a regular slot is ever expanded, so a slot open at both ends terminates. */
const MAX_SPAN_DAYS = 400

/**
 * Every occurrence of these trainings between `from` and `until`, inclusive,
 * by date then time.
 *
 * A guided series is its session rows. A regular one is its weekday over its
 * own period, each date merged with the row that may say something about it
 * — cancelled, or a note. A row for a date the slot does not cover is ignored:
 * it is an exception to nothing.
 */
export function trainingOccurrences(
  trainings: Training[],
  sessions: TrainingSession[],
  from: string,
  until: string,
): TrainingOccurrence[] {
  const byKey = new Map(sessions.map((s) => [occurrenceKey(s.trainingId, s.date), s]))
  const out: TrainingOccurrence[] = []
  for (const training of trainings) {
    if (training.kind === 'guided') {
      for (const s of sessions) {
        if (s.trainingId !== training.id || s.date < from || s.date > until) continue
        out.push({ training, date: s.date, cancelled: s.cancelled, ...(s.note ? { note: s.note } : {}) })
      }
      continue
    }
    if (!training.weekday) continue
    const start = training.validFrom && training.validFrom > from ? training.validFrom : from
    const end = training.validUntil && training.validUntil < until ? training.validUntil : until
    if (start > end) continue
    // First matching weekday on or after `start`, then a week at a time.
    let date = addDays(start, (training.weekday - isoWeekday(start) + 7) % 7)
    for (let i = 0; date <= end && i < MAX_SPAN_DAYS; i += 7, date = addDays(date, 7)) {
      const row = byKey.get(occurrenceKey(training.id, date))
      out.push({
        training,
        date,
        cancelled: row?.cancelled ?? false,
        ...(row?.note ? { note: row.note } : {}),
      })
    }
  }
  return out.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.training.startTime.localeCompare(b.training.startTime) ||
    a.training.displayName.localeCompare(b.training.displayName, 'fr'),
  )
}

/** One club's trainings, guided first then by name — the order screens list series in. */
export function clubTrainings(trainings: Training[], clubId: string | undefined): Training[] {
  if (!clubId) return []
  return trainings
    .filter((t) => t.clubId === clubId)
    .sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'guided' ? -1 : 1) ||
      a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }),
    )
}

/**
 * A club's occurrences from `today` for `days` days — what the list shows.
 * Today's included: a session tonight is the one somebody opens the app for.
 */
export function upcomingOccurrences(
  data: { trainings: Training[]; trainingSessions: TrainingSession[] },
  clubId: string | undefined,
  today: string,
  days = 28,
): TrainingOccurrence[] {
  return trainingOccurrences(clubTrainings(data.trainings, clubId), data.trainingSessions, today, addDays(today, days))
}

// ---------------------------------------------------------------------------
// Who is expected, and who said what
// ---------------------------------------------------------------------------

/** A member as this reads one — `User` satisfies it, so does an API row. */
export interface TrainingMember {
  id: string
  clubId?: string
  isPlayer?: boolean
  status?: string
}

/**
 * Who is expected at a training, as member ids.
 *
 * Its groups (#602), or — when it names none — the club's active licensees.
 * A group counts its members whatever they are, since belonging to « Jeunes
 * dirigé » is what the coach said; the whole-club fallback only means players,
 * because "tout le club" read literally would ring the treasurer about a
 * Tuesday session. Archived members are never expected.
 */
export function expectedMemberIds(
  training: Pick<Training, 'clubId' | 'memberGroupIds'>,
  memberGroups: MemberGroup[],
  members: TrainingMember[],
): string[] {
  const inClub = members.filter((m) => m.clubId === training.clubId && m.status !== 'archived')
  if (!training.memberGroupIds.length) {
    return inClub.filter((m) => m.isPlayer !== false).map((m) => m.id)
  }
  const wanted = new Set(training.memberGroupIds)
  const ids = new Set<string>()
  for (const g of memberGroups) {
    if (g.clubId !== training.clubId || !wanted.has(g.id)) continue
    for (const id of g.memberIds) ids.add(id)
  }
  return inClub.filter((m) => ids.has(m.id)).map((m) => m.id)
}

type SessionData = { trainings: Training[]; trainingSessions: TrainingSession[]; memberGroups: MemberGroup[] }

/** How far ahead the Accueil looks for each kind: a coach's month, a slot's three weeks. */
export const UPCOMING_DAYS: Record<TrainingKind, number> = { guided: 60, regular: 28 }

/**
 * The next few sessions of one kind this member is expected at (#608) — what
 * the Accueil shows, one carousel per kind, on web and app alike.
 *
 * Cancelled ones are kept: « annulée ce mardi » is exactly what is worth
 * seeing on the Accueil, and the card says so.
 */
export function upcomingSessionsFor(
  data: SessionData,
  members: TrainingMember[],
  clubId: string | undefined,
  memberId: string | undefined,
  today: string,
  kind: TrainingKind,
  count = 3,
): TrainingOccurrence[] {
  if (!memberId) return []
  const series = clubTrainings(data.trainings, clubId).filter((t) => t.kind === kind)
  return trainingOccurrences(series, data.trainingSessions, today, addDays(today, UPCOMING_DAYS[kind]))
    .filter((o) => expectedMemberIds(o.training, data.memberGroups, members).includes(memberId))
    .slice(0, count)
}

// ---------------------------------------------------------------------------
// Calendar (#608) — one session, or a guided series, into the member's agenda
// ---------------------------------------------------------------------------

/** How long a session lasts when its series names no end: an evening's two hours. */
const DEFAULT_SESSION_HOURS = 2

/**
 * The event one session becomes — the same shape a match does (`MatchEvent`),
 * so the app's native screen and the web's .ics take it as they are.
 */
export function buildTrainingEvent(o: Pick<TrainingOccurrence, 'training' | 'date'>, address?: Address): MatchEvent {
  const [y, m, d] = o.date.split('-').map(Number)
  const [sh, sm] = o.training.startTime.split(':').map(Number)
  const startDate = new Date(y, m - 1, d, sh, sm)
  let endDate = new Date(startDate.getTime() + DEFAULT_SESSION_HOURS * 3_600_000)
  if (o.training.endTime) {
    const [eh, em] = o.training.endTime.split(':').map(Number)
    endDate = new Date(y, m - 1, d, eh, em)
  }
  const location = address ? [address.label, formatAddress(address)].filter(Boolean).join(', ') : undefined
  return {
    title: o.training.displayName,
    startDate,
    endDate,
    allDay: false,
    ...(location ? { location } : {}),
    ...(o.training.notes ? { notes: o.training.notes } : {}),
  }
}

/** One UID per session, so importing a series twice updates rather than doubles. */
export const trainingEventUid = (trainingId: string, date: string) => `${trainingId}-${date}@clubping.fr`

/**
 * The dates a series' calendar carries: every guided date still on, from today.
 * A past evening in someone's agenda is noise, and a cancelled one a lie.
 */
export function seriesCalendarDates(sessions: TrainingSession[], trainingId: string, today: string): string[] {
  return sessions
    .filter((s) => s.trainingId === trainingId && !s.cancelled && s.date >= today)
    .map((s) => s.date)
    .sort()
}

/** The series link's path, under /api — what the app opens for « Toute la série ». */
export const seriesCalendarPath = (t: Pick<Training, 'id' | 'calendarToken'>) =>
  `/trainings/${encodeURIComponent(t.id)}/calendar.ics?token=${encodeURIComponent(t.calendarToken ?? '')}`

/** "Tout le club" or the groups' names, joined — who a training is for, in words. */
export function audienceLabel(training: Pick<Training, 'memberGroupIds'>, memberGroups: MemberGroup[]): string {
  if (!training.memberGroupIds.length) return 'Tout le club'
  const names = memberGroups
    .filter((g) => training.memberGroupIds.includes(g.id))
    .map((g) => g.displayName)
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  return names.length ? names.join(', ') : 'Aucun groupe'
}

/** This member's answer for one session, if any. */
export function answerOf(
  answers: TrainingAvailability[],
  trainingId: string,
  date: string,
  playerId: string | undefined,
): AvailabilityStatus | undefined {
  if (!playerId) return undefined
  return answers.find((a) => a.trainingId === trainingId && a.date === date && a.playerId === playerId)?.status
}

export interface AnswerCounts {
  available: number
  maybe: number
  unavailable: number
  /** Expected members with no row — "sans réponse" is an absence, not a value. */
  none: number
}

/**
 * The tally for one session, over the members expected at it. An answer from
 * someone no longer expected (they left the group) is not counted: the coach
 * reads this line to know who to plan for.
 */
export function answerCounts(
  answers: TrainingAvailability[],
  trainingId: string,
  date: string,
  expectedIds: string[],
): AnswerCounts {
  const counts: AnswerCounts = { available: 0, maybe: 0, unavailable: 0, none: 0 }
  for (const id of expectedIds) {
    const status = answerOf(answers, trainingId, date, id)
    counts[status ?? 'none'] += 1
  }
  return counts
}

/**
 * The tally in one line — "3 oui · 1 peut-être · 4 sans réponse", zeros left
 * out, the same words on web and app.
 */
export function answerTally(c: AnswerCounts): string {
  const parts = [
    c.available && `${c.available} oui`,
    c.maybe && `${c.maybe} peut-être`,
    c.unavailable && `${c.unavailable} non`,
    c.none && `${c.none} sans réponse`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Personne n’est attendu'
}

/**
 * Who runs a club's trainings: its administrators, and a general admin — the
 * same people who define its groups, so the same rule (`administers` on the
 * API side).
 */
export const mayManageTrainings = (
  viewer: Pick<User, 'role' | 'clubId'> | null | undefined,
  clubId: string | undefined,
): boolean => mayManageMemberGroups(viewer, clubId)

/**
 * Who runs one series' schedule: the club's admins, and — for a guided series
 * — the members it names as its managers. The schedule is its dates, which of
 * them are off, and the answers of whoever is expected; the series itself
 * (time, place, audience, managers) stays `mayManageTrainings`.
 */
export const mayManageSchedule = (
  viewer: Pick<User, 'id' | 'role' | 'clubId'> | null | undefined,
  training: Pick<Training, 'clubId' | 'kind' | 'managerIds'>,
): boolean =>
  mayManageTrainings(viewer, training.clubId) ||
  (!!viewer && training.kind === 'guided' && training.managerIds.includes(viewer.id))

// ---------------------------------------------------------------------------
// Reminders (#495's ledger, a second and third kind)
// ---------------------------------------------------------------------------

/** The ledger's `kind` for a training reminder; `game_id` holds `occurrenceKey`. */
export const TRAINING_REMINDER = 'training_reminder'
/** Sent once to whoever had been reminded of a session later called off. */
export const TRAINING_CANCELLED = 'training_cancelled'

/** The widest lead a member may choose — what the sweep has to look ahead by. */
export const TRAINING_REMINDER_HORIZON_DAYS = 7

/** An occurrence with its audience already resolved — what the sweep reads. */
export interface OccurrenceAudience {
  key: string
  kind: TrainingKind
  date: string
  cancelled: boolean
  memberIds: string[]
}

export interface DueTrainingNotification {
  userId: string
  key: string
}

/** The ledger's key for (member, occurrence), as `sentKey` for a match. */
export const trainingSentKey = (userId: string, key: string) => `${userId} ${key}`

/**
 * Who is owed a reminder for a training session, right now.
 *
 * The match rule turned around the same way (#495): not "the sessions exactly
 * N days out" but "who is expected at a session inside their own lead time and
 * has not been told?". That is what lets the lead be each member's own — the
 * member choosing "la veille" is simply not due until then — and it still picks
 * up whoever joins the group late, on the next run.
 *
 * Never on the day itself: the sweep runs in the early evening, after most
 * sessions of the day have started. A cancelled session is nobody's reminder.
 */
export function trainingRemindersDue(
  occurrences: OccurrenceAudience[],
  preferencesOf: (userId: string) => NotificationPreferences,
  today: string,
  alreadySent: ReadonlySet<string>,
): DueTrainingNotification[] {
  const due: DueTrainingNotification[] = []
  const seen = new Set<string>()
  for (const occ of occurrences) {
    if (occ.cancelled) continue
    const days = daysUntil(occ.date, today)
    if (days === null || days < 1) continue
    const category = categoryOfTraining(occ.kind)
    for (const userId of occ.memberIds) {
      const pref = preferencesOf(userId)[category]
      if (!pref.enabled || days > pref.leadDays) continue
      const k = trainingSentKey(userId, occ.key)
      if (alreadySent.has(k) || seen.has(k)) continue
      seen.add(k)
      due.push({ userId, key: occ.key })
    }
  }
  return due
}

/**
 * Who has to hear that a session is off: whoever was reminded of it, or said
 * they were coming, and has not been told yet.
 *
 * Not everyone expected. A member who was never reminded and never answered
 * was not counting on it, and a push about a session they did not know was on
 * is noise. Today counts — a session called off at lunchtime is the one where
 * the notice matters most.
 */
export function cancellationsDue(
  occurrences: OccurrenceAudience[],
  counting: ReadonlyMap<string, ReadonlySet<string>>,
  preferencesOf: (userId: string) => NotificationPreferences,
  today: string,
  alreadySent: ReadonlySet<string>,
): DueTrainingNotification[] {
  const due: DueTrainingNotification[] = []
  for (const occ of occurrences) {
    if (!occ.cancelled) continue
    const days = daysUntil(occ.date, today)
    if (days === null || days < 0) continue
    const category = categoryOfTraining(occ.kind)
    for (const userId of counting.get(occ.key) ?? []) {
      if (!preferencesOf(userId)[category].enabled) continue
      if (alreadySent.has(trainingSentKey(userId, occ.key))) continue
      due.push({ userId, key: occ.key })
    }
  }
  return due
}

/** What a push about a session needs to say. */
export interface TrainingLabels {
  trainingId: string
  kind: TrainingKind
  displayName: string
  date: string
  startTime: string
  /** "Gymnase Jean-Moulin", or absent when the club has no address. */
  place?: string
  note?: string
}

const where = (t: TrainingLabels) => (t.place ? ` à ${t.place}` : '')

/** The reminder. A guided session asks; a regular one only says. */
export function trainingReminderPush(t: TrainingLabels, today: string): PushMessage {
  const days = daysUntil(t.date, today) ?? 0
  const when = `${longDate(t.date)} à ${formatTime(t.startTime)}${where(t)}, ${inDays(days)}.`
  return {
    title: t.displayName,
    body: asksForAnswer(t.kind) ? `${when} Indique si tu viens.` : when,
    data: { kind: TRAINING_REMINDER, trainingId: t.trainingId, date: t.date },
  }
}

/** The notice for a session called off after people were told about it. */
export function trainingCancelledPush(t: TrainingLabels): PushMessage {
  // No agreement to get wrong: the name is typed by the club, and "annulé"
  // after « Séance jeunes » would read as a mistake.
  const base = `${t.displayName}, ${longDate(t.date)} à ${formatTime(t.startTime)} : séance annulée.`
  return {
    title: `Annulé — ${t.displayName}`,
    body: t.note ? `${base} ${t.note}` : base,
    data: { kind: TRAINING_CANCELLED, trainingId: t.trainingId, date: t.date },
  }
}

// ---------------------------------------------------------------------------
// Writes, as both data contexts apply them locally
// ---------------------------------------------------------------------------

/** What an admin fills in; the club and the id are the context's to supply. */
export type TrainingDraft = Omit<Training, 'id' | 'clubId'>

/**
 * Creating and editing a series are awaited, on web and app alike, like a
 * member group's name (#602): the API checks the times and the weekday, and a
 * form that closed on a refused write would leave a series on screen that
 * the next reload removes.
 */
export type TrainingResult = { ok: true; training: Training } | { ok: false; message: string }

const TRAINING_REFUSALS: Record<string, string> = {
  bad_name: "Donnez un nom à l'entraînement.",
  bad_time: 'Vérifiez les horaires : la fin doit suivre le début.',
  bad_weekday: 'Choisissez le jour de la semaine.',
  bad_period: 'La date de fin doit suivre la date de début.',
}

export const TRAINING_FAILED = "L'entraînement n'a pas pu être enregistré. Réessayez."

/** The sentence for an API refusal code; anything unknown is a plain failure. */
export const trainingRefusal = (code: string | undefined) => (code && TRAINING_REFUSALS[code]) || TRAINING_FAILED

/**
 * The same checks as the API, so a form can say what is wrong without a trip
 * — and so an offline or mock context refuses exactly what the server would.
 */
export function validateTrainingDraft(d: TrainingDraft): string | null {
  if (!d.displayName.trim()) return TRAINING_REFUSALS.bad_name
  if (!isTime(d.startTime) || (d.endTime && (!isTime(d.endTime) || d.endTime <= d.startTime))) {
    return TRAINING_REFUSALS.bad_time
  }
  if (d.kind === 'regular') {
    if (!d.weekday || d.weekday < 1 || d.weekday > 7) return TRAINING_REFUSALS.bad_weekday
    if (d.validFrom && d.validUntil && d.validUntil < d.validFrom) return TRAINING_REFUSALS.bad_period
  }
  return null
}

/** Add dates to a guided series; a date it already has is left as it is. */
export function withAddedDates(sessions: TrainingSession[], trainingId: string, dates: string[]): TrainingSession[] {
  const have = new Set(sessions.filter((s) => s.trainingId === trainingId).map((s) => s.date))
  const added = [...new Set(dates)].filter((d) => !have.has(d)).map((date) => ({ trainingId, date, cancelled: false }))
  return [...sessions, ...added]
}

/**
 * Say something about one date, as the API does: on a guided series the row is
 * the session and must exist; on a regular one it is an exception, dropped
 * once it says nothing.
 */
export function withSessionState(
  sessions: TrainingSession[],
  training: Pick<Training, 'id' | 'kind'>,
  date: string,
  state: { cancelled: boolean; note?: string },
): TrainingSession[] {
  const note = state.note?.trim() || undefined
  const row: TrainingSession = { trainingId: training.id, date, cancelled: state.cancelled, ...(note ? { note } : {}) }
  const same = (s: TrainingSession) => s.trainingId === training.id && s.date === date
  if (training.kind === 'guided') return sessions.map((s) => (same(s) ? row : s))
  const rest = sessions.filter((s) => !same(s))
  return state.cancelled || note ? [...rest, row] : rest
}

/** Set, or with `null` withdraw, one member's answer for one session. */
export function withAnswer(
  answers: TrainingAvailability[],
  trainingId: string,
  date: string,
  playerId: string,
  status: AvailabilityStatus | null,
): TrainingAvailability[] {
  const rest = answers.filter((a) => !(a.trainingId === trainingId && a.date === date && a.playerId === playerId))
  return status ? [...rest, { trainingId, date, playerId, status }] : rest
}
