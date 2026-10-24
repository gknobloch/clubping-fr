// Asking a member to review the app on its store (#781).
//
// Shared by the API (which keeps the person's answer) and the app (which
// decides the moment). Pure: no database, no network.
//
// Two forms, by platform, and the difference is the stores' rules, not taste:
//
// - iOS asks through the system's own prompt (`SKStoreReviewController`).
//   Guideline 5.6.1 disallows custom review prompts, and the system already
//   caps itself at three a year. It never says whether it appeared, nor
//   whether a review was left.
// - Android asks with our own sheet — « Donner mon avis », « Plus tard »,
//   « Ne plus demander » — whose first button opens the Play listing. Google's
//   In-App Review API forbids asking anything before it, and a link to the
//   listing is not that API.
//
// What both share is restraint: asked rarely, never twice in a season, never
// again once declined or reviewed.

/** How a person stopped being asked: they said no, or they reviewed. */
export type ReviewPromptStop = 'declined' | 'reviewed'

/** What the person's devices have been told so far — one row per person. */
export interface ReviewPromptState {
  /** First time a build carrying this asked about the person (ms). */
  firstSeenAt: number
  /** Prompts put in front of them, on any device. */
  askedCount: number
  lastAskedAt?: number
  stopped?: ReviewPromptStop
}

/**
 * What a device reports.
 *
 * `asked`: a prompt was put in front of them and they did not stop it — the
 * iOS request (whose outcome nobody is told), or the Android sheet's « Plus
 * tard », or the sheet dismissed. `declined`: « Ne plus demander ».
 * `reviewed`: they went to the store's review page, from the sheet or from
 * the row in Compte — the closest we come to knowing they wrote one.
 */
export type ReviewPromptEvent = 'asked' | 'declined' | 'reviewed'

const DAY_MS = 86_400_000

/** Not before the person has lived with the app for a while. */
export const REVIEW_MIN_AGE_DAYS = 14
/** Answers of their own before the app is worth asking about. */
export const REVIEW_MIN_ANSWERS = 3
/** At most once a season, give or take — « Plus tard » means months. */
export const REVIEW_INTERVAL_DAYS = 120
/** Then never again, as Apple does for itself. */
export const REVIEW_MAX_ASKS = 3

/**
 * Whether now is a moment to ask.
 *
 * `ownAnswers` is how many availabilities the member gave for themselves —
 * the app's one gesture that says it is being used for what it is for. The
 * caller asks only right after such an answer, so the prompt lands after a
 * task and not in the middle of one.
 */
export function reviewPromptDue(state: ReviewPromptState, now: number, ownAnswers: number): boolean {
  if (state.stopped) return false
  if (state.askedCount >= REVIEW_MAX_ASKS) return false
  if (ownAnswers < REVIEW_MIN_ANSWERS) return false
  if (now - state.firstSeenAt < REVIEW_MIN_AGE_DAYS * DAY_MS) return false
  if (state.lastAskedAt !== undefined && now - state.lastAskedAt < REVIEW_INTERVAL_DAYS * DAY_MS) return false
  return true
}

/**
 * The state after an event. A stop is never lifted, and « reviewed » outranks
 * « declined »: someone who said no and later rated the app from Compte has
 * reviewed. Only a prompt counts towards the cap — the row in Compte is the
 * member's own doing, not something we put in front of them.
 */
export function applyReviewEvent(state: ReviewPromptState, event: ReviewPromptEvent, now: number): ReviewPromptState {
  const stopped: ReviewPromptStop | undefined =
    event === 'reviewed' || state.stopped === 'reviewed' ? 'reviewed'
      : event === 'declined' ? 'declined'
        : state.stopped
  const prompted = event === 'asked' || event === 'declined'
  return {
    ...state,
    ...(prompted ? { askedCount: state.askedCount + 1, lastAskedAt: now } : {}),
    ...(stopped ? { stopped } : {}),
  }
}

export function isReviewPromptEvent(v: unknown): v is ReviewPromptEvent {
  return v === 'asked' || v === 'declined' || v === 'reviewed'
}

/**
 * Two records of one person, as one — what merging two people keeps (#655).
 * The more cautious of the two on every count: a stop on either side holds,
 * the higher count, the latest prompt, the earliest first sight.
 */
export function mergeReviewPromptStates(a: ReviewPromptState, b: ReviewPromptState): ReviewPromptState {
  const stopped = a.stopped === 'reviewed' || b.stopped === 'reviewed' ? 'reviewed' : (a.stopped ?? b.stopped)
  const lastAskedAt = Math.max(a.lastAskedAt ?? -1, b.lastAskedAt ?? -1)
  return {
    firstSeenAt: Math.min(a.firstSeenAt, b.firstSeenAt),
    askedCount: Math.max(a.askedCount, b.askedCount),
    ...(lastAskedAt >= 0 ? { lastAskedAt } : {}),
    ...(stopped ? { stopped } : {}),
  }
}

/**
 * Where « Donner mon avis » and « Noter Club Ping » lead: the store's review
 * page itself on iOS (`action=write-review`, which Apple documents for a
 * persistent link), the listing on Android, whose review box is on it. The
 * `market://` form opens the Play app; the https one is its fallback.
 */
export const REVIEW_URLS = {
  ios: 'itms-apps://apps.apple.com/app/id6799859449?action=write-review',
  android: 'market://details?id=fr.clubping.app',
  androidFallback: 'https://play.google.com/store/apps/details?id=fr.clubping.app',
} as const
