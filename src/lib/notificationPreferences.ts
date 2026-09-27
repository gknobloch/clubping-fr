// What a member wants pushed to their devices, per category (#608).
//
// Shared by the API (which stores the member's choices and filters the sweep
// by them), the app (which draws the switches) and the tests. Pure: no
// database, no network.
//
// Stored sparse — only what the member changed — and resolved here against the
// defaults, so a default can be revised later without rewriting a row per
// member, and a member who never opened the screen gets whatever the current
// defaults are.

/** The three things a member may want to hear about, independently. */
export type NotificationCategory = 'match' | 'training_guided' | 'training_regular'

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'match',
  'training_guided',
  'training_regular',
]

export interface CategoryPreference {
  enabled: boolean
  /**
   * How many days ahead the reminder goes out. Only the trainings let a member
   * choose: a match's seven days are the captain's lead time to fill a hole,
   * not the player's, so that one is fixed (`AVAILABILITY_WINDOW_DAYS`).
   */
  leadDays: number
}

export type NotificationPreferences = Record<NotificationCategory, CategoryPreference>

/** What is stored, and what a PATCH carries: only what departs from defaults. */
export type NotificationPreferencesPatch = Partial<
  Record<NotificationCategory, Partial<CategoryPreference>>
>

/**
 * Matches and guided sessions on, regular slots off.
 *
 * A guided session is dated and asks for an answer; a regular slot is where
 * the usual people turn up every week, and a weekly push about it for everyone
 * would train the club to mute the app — match reminders included. Those who
 * want the Tuesday nudge switch it on.
 *
 * Three days for the trainings: far enough to rearrange an evening, near
 * enough that the reminder is still about *this* week.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  match: { enabled: true, leadDays: 7 },
  training_guided: { enabled: true, leadDays: 3 },
  training_regular: { enabled: false, leadDays: 3 },
}

/** The lead times offered for a training reminder, in days. */
export const LEAD_DAY_CHOICES: readonly number[] = [1, 2, 3, 5, 7]

/** Whether a category's lead time is the member's to choose. */
export const hasChoosableLead = (category: NotificationCategory) => category !== 'match'

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, { title: string; hint: string }> = {
  match: {
    title: 'Matchs de championnat',
    hint: "Une demande de disponibilité une semaine avant chaque match, et — si vous êtes capitaine — les dispos qui changent d'ici là.",
  },
  training_guided: {
    title: 'Entraînements dirigés',
    hint: 'Un rappel avant chaque séance où vous êtes attendu, pour dire si vous venez.',
  },
  training_regular: {
    title: 'Entraînements libres',
    hint: 'Un rappel avant chaque créneau habituel où vous êtes attendu.',
  },
}

/** "3 jours avant", "la veille". */
export function leadDaysLabel(days: number): string {
  return days === 1 ? 'La veille' : `${days} jours avant`
}

const isCategory = (k: string): k is NotificationCategory =>
  (NOTIFICATION_CATEGORIES as readonly string[]).includes(k)

const validLead = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && LEAD_DAY_CHOICES.includes(n)

/**
 * Keep only what is a real category with a well-formed value — the one gate
 * between a request body (or a stored column) and what the sweep acts on.
 * Anything else is dropped rather than refused: a newer build may know a
 * category this one does not.
 */
export function sanitizePreferencesPatch(input: unknown): NotificationPreferencesPatch {
  const out: NotificationPreferencesPatch = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isCategory(key) || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const entry: Partial<CategoryPreference> = {}
    if (typeof v.enabled === 'boolean') entry.enabled = v.enabled
    if (hasChoosableLead(key) && validLead(v.leadDays)) entry.leadDays = v.leadDays
    if (Object.keys(entry).length) out[key] = entry
  }
  return out
}

/** The stored column, read. NULL, garbage and `{}` all mean "every default". */
export function parsePreferences(json: string | null | undefined): NotificationPreferencesPatch {
  if (!json) return {}
  try {
    return sanitizePreferencesPatch(JSON.parse(json))
  } catch {
    return {}
  }
}

/** Fold a change into what is stored. */
export function mergePreferences(
  stored: NotificationPreferencesPatch,
  patch: NotificationPreferencesPatch,
): NotificationPreferencesPatch {
  const out: NotificationPreferencesPatch = { ...stored }
  for (const category of NOTIFICATION_CATEGORIES) {
    if (patch[category]) out[category] = { ...stored[category], ...patch[category] }
  }
  return out
}

/** What a member actually gets, defaults filled in. */
export function resolveNotificationPreferences(
  stored: NotificationPreferencesPatch | null | undefined,
): NotificationPreferences {
  const out = {} as NotificationPreferences
  for (const category of NOTIFICATION_CATEGORIES) {
    const own = stored?.[category]
    const fallback = DEFAULT_NOTIFICATION_PREFERENCES[category]
    out[category] = {
      enabled: own?.enabled ?? fallback.enabled,
      leadDays: hasChoosableLead(category) && validLead(own?.leadDays) ? own.leadDays : fallback.leadDays,
    }
  }
  return out
}
