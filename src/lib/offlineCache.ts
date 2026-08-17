import type { DataState } from '@/types'

/**
 * Last-known `GET /api/data`, kept so the app has something to show when the
 * network does not answer (#387) — a line-up is read in a sports hall, often a
 * basement, which is exactly where the signal is not.
 *
 * The cache is stamped with the member it belongs to and never handed to
 * anyone else. Clubs share phones and tablets, so a cache keyed only by device
 * would show one member the previous member's club on the next sign-in.
 */
const KEY = 'pp-club-data-cache'

/** Bumped when DataState changes shape, so an old cache is dropped, not parsed. */
const VERSION = 1

type Entry = {
  version: number
  userId: string
  fetchedAt: string
  data: DataState
}

/** Every access is guarded: storage throws in private modes and when full. */
function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readCache(userId: string): { data: DataState; fetchedAt: string } | null {
  const store = storage()
  if (!store || !userId) return null
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry
    if (entry.version !== VERSION || entry.userId !== userId) return null
    if (!entry.data || !Array.isArray(entry.data.teams)) return null
    return { data: entry.data, fetchedAt: entry.fetchedAt }
  } catch {
    // Malformed or unreadable — treat as no cache rather than breaking boot.
    return null
  }
}

export function writeCache(userId: string, data: DataState) {
  const store = storage()
  if (!store || !userId) return
  try {
    const entry: Entry = { version: VERSION, userId, fetchedAt: new Date().toISOString(), data }
    store.setItem(KEY, JSON.stringify(entry))
  } catch {
    // Over quota, most likely. Losing the cache costs offline reads, not the
    // session, so there is nothing to tell the member about.
  }
}

export function clearCache() {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/** "données du 14 août à 09:12" — what the banner says the cache is worth. */
export function formatFetchedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
