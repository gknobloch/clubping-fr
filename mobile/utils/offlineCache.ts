import AsyncStorage from '@react-native-async-storage/async-storage'

// ---------------------------------------------------------------------------
// Offline read cache (level 1 offline support, issue #144; keyed per member,
// #509)
//
// Persists the last successful `GET /api/data` payload so the app can render
// instantly on a cold start and stay usable with no connectivity.
//
// The entry names the member it belongs to, and `readCache` refuses one that
// names somebody else. That is deliberately a rule about READING, not about
// clearing: erasing on sign-out supposes a sign-out happens, and that it
// succeeds — `clearCache` swallows its own failures, and a profile switch would
// not pass through one at all. Refusing at the point of use supposes nothing.
// Clubs share phones and tablets (the same reason `push_tokens` is keyed on the
// token, #495), so "whose data is this?" has to be answerable from the entry
// itself.
//
// The clear on sign-out stays, as a net: it frees the space, it is no longer
// what keeps two members apart.
// ---------------------------------------------------------------------------

const CACHE_KEY = 'pp-club-data-cache'

/**
 * Bumped when the stored shape changes, so an old entry is dropped rather than
 * parsed.
 *
 * Not the same job as `withDefaults` in DataContext, which fills in fields a
 * payload predates — that one rescues a readable entry, this one discards an
 * unreadable one. Both are needed; they answer different questions.
 */
const VERSION = 1

export interface CachedData<T> {
  data: T
  /** ISO timestamp of the fetch that produced this payload. */
  lastSyncedAt: string
}

interface Entry<T> extends CachedData<T> {
  version: number
  /** The member this payload was fetched for. */
  userId: string
}

/**
 * The cached payload for `userId`, or null when there is none for them.
 *
 * Null covers every doubt: no entry, an entry written for another member, a
 * shape this build no longer understands, storage that refused to answer. None
 * of them is worth guessing at — the caller simply has nothing to show yet.
 */
export async function readCache<T>(userId: string | null): Promise<CachedData<T> | null> {
  if (!userId) return null
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Entry<T>
    if (!parsed || parsed.version !== VERSION || parsed.userId !== userId) return null
    if (typeof parsed.lastSyncedAt !== 'string' || parsed.data == null) return null
    return { data: parsed.data, lastSyncedAt: parsed.lastSyncedAt }
  } catch {
    return null
  }
}

/** Persist a freshly fetched payload, stamped with the member it is for. */
export async function writeCache<T>(
  userId: string | null,
  data: T,
  lastSyncedAt: string,
): Promise<void> {
  // Nobody to attribute it to — and an unattributed entry is exactly what this
  // cache must never hold again.
  if (!userId) return
  try {
    const entry: Entry<T> = { version: VERSION, userId, data, lastSyncedAt }
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    /* best-effort — a failed cache write must never break the app */
  }
}

/** Drop the cache (e.g. on sign-out, so the space is freed). */
export async function clearCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}
