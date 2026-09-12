import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import type * as NotificationsModule from 'expo-notifications'
import { Notifications } from '@/utils/expoNotifications'
import { apiUrl } from '@/constants/api'
import { dataHeaders } from '@/utils/api'

/**
 * The device's side of the push notifications (#495): ask for permission, get
 * an Expo token, hand it to the backend, and give it back at logout.
 *
 * The last of those is why the token is kept in AsyncStorage. Logging out is
 * exactly when `getExpoPushTokenAsync` is least likely to answer — no network,
 * or the OS has since revoked the permission — and a token we cannot name is a
 * token we cannot ask the backend to forget, which leaves a signed-out phone
 * ringing with another member's matches. So the value is written down the
 * moment we have it, and the sign-out path reads it rather than asking again.
 */

const TOKEN_KEY = 'pp-push-token'

/**
 * Android will not show a notification that names no channel on 8.0 and above
 * — it is dropped silently, which looks exactly like a backend that never
 * sent. The name is the one the system settings show the member, so it is in
 * French like the rest of the app; `default` is the id the API sends.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Matchs et disponibilités',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

/**
 * The EAS project this build belongs to — `getExpoPushTokenAsync` needs it and
 * refuses to run without one.
 *
 * Read from two places on purpose. `Constants.expoConfig` is typed `| null`,
 * and with expo-updates configured it is derived from the embedded update
 * manifest: a build made locally rather than by EAS can have no such manifest,
 * and then the whole of app.json — `extra.eas.projectId` included — is simply
 * absent at runtime. `easConfig` is populated by EAS itself and survives that.
 *
 * Neither is a secret: the id is committed in app.json and travels in every
 * binary.
 */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined
}

export type PermissionOutcome = 'granted' | 'denied' | 'unavailable'

/**
 * Ask for notification permission, but only ask ONCE.
 *
 * iOS grants exactly one prompt per install: answer it away and the app can
 * never raise it again, only send the member to the system settings. So a
 * status that is already decided is returned as it stands rather than
 * re-requested, and the caller registers on a grant instead of nagging.
 */
async function ensurePermission(): Promise<PermissionOutcome> {
  if (!Notifications) return 'unavailable'
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return 'granted'
  if (!current.canAskAgain) return 'denied'
  const asked = await Notifications.requestPermissionsAsync()
  return asked.granted ? 'granted' : 'denied'
}

/**
 * Why a device ended up with no registration. Every one of these is an
 * ordinary state rather than a fault — but they are four different ordinary
 * states, and they are indistinguishable from outside.
 */
export type RegistrationSkip =
  /**
   * expo-notifications could not be loaded at all. Expo Go on Android since
   * SDK 53 — see utils/expoNotifications.ts.
   */
  | 'unavailable'
  /** The member refused, or had already refused for good. */
  | 'permission'
  /** No EAS project id at runtime — see projectId(). */
  | 'no-project-id'
  /** No push service to register with: a simulator, or APNs refused. */
  | 'no-device-token'
  /** The backend would not take it — no session, or it is down. */
  | 'not-registered'

/**
 * Register this device for the signed-in member, returning the token.
 *
 * Called on every launch with a session, not only the first: iOS reissues a
 * token after a restore or a reinstall, and the backend's upsert is keyed on
 * the token, so re-registering is also what moves a shared phone to whoever is
 * signed into it now.
 *
 * Returns null for every reason a device may have none, and none of them is
 * worth an alert — the app simply is not notified. But silence is not the same
 * as invisibility: each exit says which one it took, because the four are
 * indistinguishable from the outside and the only symptom they share is an
 * empty `push_tokens` table. The log line is not behind `__DEV__`: this fails
 * in exactly the builds where `__DEV__` is false.
 */
export async function registerForPush(): Promise<string | null> {
  const skip = (reason: RegistrationSkip) => {
    console.warn(`[push] appareil non enregistré : ${reason}`)
    return null
  }
  try {
    if (!Notifications) return skip('unavailable')
    await ensureAndroidChannel()
    const permission = await ensurePermission()
    if (permission !== 'granted') return skip(permission === 'unavailable' ? 'unavailable' : 'permission')
    const id = projectId()
    if (!id) return skip('no-project-id')
    let token: string
    try {
      // Throws on a simulator, where there is no push service to register with.
      ;({ data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id }))
    } catch (e) {
      console.warn('[push] jeton refusé par la plateforme', e)
      return skip('no-device-token')
    }
    await AsyncStorage.setItem(TOKEN_KEY, token)
    const res = await fetch(apiUrl('/notifications/push-tokens'), {
      method: 'POST',
      headers: dataHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token, platform: Platform.OS }),
    })
    if (!res.ok) {
      console.warn(`[push] le serveur a refusé l'enregistrement : HTTP ${res.status}`)
      return skip('not-registered')
    }
    return token
  } catch (e) {
    console.warn('[push] enregistrement interrompu', e)
    return null
  }
}

/**
 * Hand the token back — what logging out does.
 *
 * Runs before the session token is cleared, because the endpoint needs one.
 * The stored value is dropped whatever the request does: a phone that fails to
 * deregister must not then believe it is still registered, and re-registering
 * on the next sign-in costs nothing.
 */
export async function forgetPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null)
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {})
  if (!token) return
  try {
    await fetch(apiUrl('/notifications/push-tokens/forget'), {
      method: 'POST',
      headers: dataHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token }),
    })
  } catch {
    /* the row ages out on its own; a failed logout must not fail the logout */
  }
}

/** Turn this member's notifications on or off, everywhere they are signed in. */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  const res = await fetch(apiUrl('/notifications/preferences'), {
    method: 'PATCH',
    headers: dataHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error('preference_not_saved')
}

/**
 * Where a tapped notification should land: the match it is about.
 *
 * The id travels in `data`, never parsed out of the text — the body is written
 * for a human and is free to change.
 */
export function gameIdOf(response: NotificationsModule.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data as { gameId?: unknown } | undefined
  return typeof data?.gameId === 'string' && data.gameId ? data.gameId : null
}
