import type { Env } from './auth'
import type { PushMessage } from '../../src/lib/pushNotifications'

/**
 * Every push the app sends goes through here (#495) — the counterpart of
 * email.ts, and for the same reason: one transport, one place that knows what
 * the environment allows, one place that logs.
 *
 * Expo rather than APNs and FCM directly. The app is built by EAS, which
 * already holds the APNs key and the FCM service account; talking to the two
 * platforms ourselves would mean carrying both credentials in Cloudflare
 * secrets and signing JWTs in a Worker, to end up with what exp.host does.
 *
 * The one thing this module owes the rest of the app beyond delivery is
 * pruning: a token for an app that has been uninstalled is dead forever, Expo
 * says so in the ticket, and nothing else will ever notice.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Expo's own cap on one request. Exceeded, it rejects the whole batch. */
const CHUNK_SIZE = 100

/** One message, addressed. */
export interface OutgoingPush extends PushMessage {
  /** An Expo push token — `ExponentPushToken[…]`. */
  to: string
}

export interface PushDelivery {
  /** Tokens Expo accepted. */
  accepted: number
  /**
   * Tokens Expo answered `DeviceNotRegistered` for: the app is gone from that
   * device and the row has to go with it, or the same dead token is retried
   * every day until the season ends.
   */
  invalidTokens: string[]
}

interface ExpoTicket {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

/**
 * Send a batch, and never let one failure lose the others.
 *
 * Nothing that calls this can usefully react to a failure — the availability
 * has already been recorded, the sweep has already decided — so a dead
 * platform is logged and the rest goes out. What the caller does get back is
 * the list of tokens to delete, which is a fact worth acting on.
 */
export async function sendPushes(
  env: Env['Bindings'],
  messages: OutgoingPush[],
): Promise<PushDelivery> {
  const delivery: PushDelivery = { accepted: 0, invalidTokens: [] }
  if (!messages.length) return delivery

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE)
    try {
      const tickets = await sendChunk(env, chunk)
      chunk.forEach((message, n) => {
        const ticket = tickets[n]
        if (!ticket || ticket.status === 'ok') {
          delivery.accepted += 1
          return
        }
        if (ticket.details?.error === 'DeviceNotRegistered') {
          delivery.invalidTokens.push(message.to)
          return
        }
        console.error(`[push] refusé pour ${message.to}: ${ticket.message ?? 'sans raison'}`)
      })
    } catch (e) {
      console.error('[push] envoi impossible', e)
    }
  }
  return delivery
}

async function sendChunk(env: Env['Bindings'], chunk: OutgoingPush[]): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Only needed once the Expo project enables push security; harmless
      // otherwise, which is why it is optional rather than a required secret.
      ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(
      chunk.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default',
        // Android needs a channel by name or the notification is silent on
        // Android 8+; the app creates this one at registration.
        channelId: 'default',
      })),
    ),
  })
  if (!res.ok) {
    console.error('[push] Expo a refusé le lot', res.status, await res.text())
    throw new Error('push_send_failed')
  }
  const body = (await res.json()) as { data?: ExpoTicket[] }
  return body.data ?? []
}

/** Shape of an Expo push token, as the register endpoint checks it. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value)
}
