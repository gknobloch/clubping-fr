import type * as NotificationsModule from 'expo-notifications'

/**
 * The one place that imports `expo-notifications`, because importing it can
 * throw (#495).
 *
 * Since SDK 53 the module raises on Android in Expo Go, at *import* time —
 * before any of its functions are called and before anything can guard the
 * call. `push.ts` is imported by `AuthContext`, which every screen imports, so
 * that throw took the whole app down at launch: a red screen instead of the
 * login form, on a client the repo's own `npm start` and `start:pr` flows use.
 *
 * Push is an enhancement. An app that cannot register a device should show the
 * fixtures anyway, so the import is attempted here, once, and its failure is
 * recorded as "no notifications module" rather than propagated. Every caller
 * already has an "this device will not be notified" path — a simulator, a
 * refusal — and this is one more of them.
 *
 * Deliberately `require` rather than a dynamic `import()`: it has to run at
 * module scope so that consumers can keep their ordinary top-level imports,
 * and it must be synchronous so no screen ever renders before we know.
 */
let loaded: typeof NotificationsModule | null = null
let failure: string | null = null

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loaded = require('expo-notifications') as typeof NotificationsModule
} catch (e) {
  loaded = null
  failure = e instanceof Error ? e.message : String(e)
  console.warn(`[push] expo-notifications indisponible dans cet environnement : ${failure}`)
}

/** The module, or null where it cannot be loaded (Expo Go on Android). */
export const Notifications = loaded

/** Why it could not be loaded — for the log line, never for the member. */
export const notificationsUnavailable = failure
