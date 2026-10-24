// Asking for a store review (#781) — the one place `expo-store-review` is
// imported, and the two calls to the API that remember the answer.
//
// The module is native, added in 1.10.0, and this JavaScript reaches older
// binaries by over-the-air update (`runtimeVersion: appVersion`), where the
// module throws on import. Required once, in a try, like `documentPicker.ts`:
// on such a binary iOS simply never asks — there is nothing to tell the
// member, and no custom prompt to fall back on (guideline 5.6.1).
import { Linking, Platform } from 'react-native'
import type * as StoreReviewModule from 'expo-store-review'
import { apiUrl } from '@/constants/api'
import { dataHeaders } from '@/utils/api'
import { REVIEW_URLS, type ReviewPromptEvent, type ReviewPromptState } from '@shared/lib/reviewPrompt'

let StoreReview: typeof StoreReviewModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StoreReview = require('expo-store-review') as typeof StoreReviewModule
} catch {
  StoreReview = null
}

/**
 * Hand the moment to iOS's own prompt. True when the request was made — which
 * is all anyone learns: the system may show nothing (its yearly cap, or a
 * TestFlight build), and never says what the member did.
 */
export async function requestSystemReview(): Promise<boolean> {
  if (!StoreReview) return false
  try {
    if (!(await StoreReview.isAvailableAsync())) return false
    await StoreReview.requestReview()
    return true
  } catch {
    return false
  }
}

/** The store's review page: the App Store's own, or the Play listing. */
export async function openReviewPage(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL(REVIEW_URLS.ios).catch(() => {})
    return
  }
  // The Play app first; a device without it (an emulator image, a de-Googled
  // phone) still has a browser.
  await Linking.openURL(REVIEW_URLS.android)
    .catch(() => Linking.openURL(REVIEW_URLS.androidFallback))
    .catch(() => {})
}

/**
 * The person's state, or null when it cannot be had — offline, a server that
 * does not know the route yet. Null never asks: silence is not a yes.
 */
export async function fetchReviewPrompt(): Promise<ReviewPromptState | null> {
  try {
    const res = await fetch(apiUrl('/review-prompt'), { headers: dataHeaders() })
    if (!res.ok) return null
    return (await res.json()) as ReviewPromptState
  } catch {
    return null
  }
}

/** Remember what happened. Best effort: a lost answer asks again, months later. */
export async function recordReviewEvent(event: ReviewPromptEvent): Promise<void> {
  await fetch(apiUrl('/review-prompt'), {
    method: 'POST',
    headers: dataHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ event }),
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// The moment: the member just said « Oui » for themselves
//
// Raised by DataContext's `setAvailability`, the one place every « Oui »
// passes, and only for an answer of one's own — never a captain's override.
// A signal rather than a watch on the data: a refetch that brings in an
// answer given on the web is not a task just finished here.
// ---------------------------------------------------------------------------
const ownYesListeners = new Set<() => void>()

export function noteOwnYes(): void {
  ownYesListeners.forEach((l) => l())
}

export function onOwnYes(listener: () => void): () => void {
  ownYesListeners.add(listener)
  return () => {
    ownYesListeners.delete(listener)
  }
}
