import { useSyncExternalStore } from 'react'
import type { SharedGame } from '@shared/lib/gameShare'

/**
 * The shared match a link asked for (#747), held until someone can open it.
 *
 * A link arrives at the navigator (`app/+native-intent.tsx`), before any
 * screen — on a cold start, before the session is even restored, and signed
 * out before there is one at all. The navigator is told to go to the Accueil,
 * and the match waits here for `SharedGameLinks`, which mounts with a session:
 * signing in after tapping the link still lands on the match.
 *
 * One at a time: a second link replaces the first, which nobody had opened.
 */
let pending: SharedGame | null = null
let version = 0
const listeners = new Set<() => void>()

export function holdSharedGame(shared: SharedGame): void {
  pending = shared
  version += 1
  listeners.forEach((l) => l())
}

/** The held match, once — it is forgotten as it is taken. */
export function takeSharedGame(): SharedGame | null {
  const shared = pending
  pending = null
  return shared
}

export function peekSharedGame(): SharedGame | null {
  return pending
}

/** Changes each time a link is held, so a component re-reads the holder. */
export function useSharedGameVersion(): number {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => version,
  )
}
