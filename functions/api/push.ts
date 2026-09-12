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
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

/** Expo's own cap on one request. Exceeded, it rejects the whole batch. */
const CHUNK_SIZE = 100

/**
 * What a delivery was for, carried through the transport untouched.
 *
 * The transport has no use for it; it exists so that when a receipt comes back
 * in error a day later, the caller can find the `notifications_sent` row that
 * delivery was supposed to honour and take it back.
 */
export interface PushRef {
  kind: string
  userId: string
  gameId: string
}

/** One message, addressed. */
export interface OutgoingPush extends PushMessage {
  /** An Expo push token — `ExponentPushToken[…]`. */
  to: string
  ref?: PushRef
}

/** An accepted message, and the handle its verdict will arrive under. */
export interface PushTicket {
  id: string
  to: string
  ref?: PushRef
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
  /**
   * Handles for every accepted message. Accepted is NOT delivered — see
   * fetchReceipts — so these are what the next run follows up on.
   */
  tickets: PushTicket[]
}

interface ExpoTicket {
  status: 'ok' | 'error'
  id?: string
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
  const delivery: PushDelivery = { accepted: 0, invalidTokens: [], tickets: [] }
  if (!messages.length) return delivery

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE)
    try {
      const tickets = await sendChunk(env, chunk)
      chunk.forEach((message, n) => {
        const ticket = tickets[n]
        if (!ticket || ticket.status === 'ok') {
          delivery.accepted += 1
          if (ticket?.id) {
            delivery.tickets.push({ id: ticket.id, to: message.to, ref: message.ref })
          }
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

// ---------------------------------------------------------------------------
// Receipts — what actually happened
// ---------------------------------------------------------------------------

/**
 * Expo's verdict on one delivery, once the platform has had its say.
 *
 * `pending` is not an outcome: Expo simply has nothing yet, or no longer has
 * anything (receipts are kept about a day). The caller waits, then gives up.
 */
export type ReceiptVerdict =
  | { status: 'ok' }
  | { status: 'error'; error?: string; message?: string; platform?: string }
  | { status: 'pending' }

interface ExpoReceipt {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string; fcm?: { response?: string }; apns?: unknown }
}

/** Expo's cap on one receipts request. */
const RECEIPTS_CHUNK = 1000

/**
 * Ask what became of a batch of accepted messages.
 *
 * This is the call whose absence let a whole afternoon's pushes report success
 * while FCM refused every one of them: `sendPushes` only ever sees a ticket,
 * which means "queued", and the platform's refusal — a service account for the
 * wrong project, a disabled API, a revoked token — arrives only here.
 *
 * Never throws. A receipts endpoint that is down must not stop the sweep that
 * calls it; the ids stay on file and are asked about again next time.
 */
export async function fetchReceipts(
  env: Env['Bindings'],
  ids: string[],
): Promise<Map<string, ReceiptVerdict>> {
  const verdicts = new Map<string, ReceiptVerdict>()
  for (let i = 0; i < ids.length; i += RECEIPTS_CHUNK) {
    const chunk = ids.slice(i, i + RECEIPTS_CHUNK)
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify({ ids: chunk }),
      })
      if (!res.ok) {
        console.error('[push] reçus indisponibles', res.status, await res.text())
        continue
      }
      const body = (await res.json()) as { data?: Record<string, ExpoReceipt> }
      for (const [id, receipt] of Object.entries(body.data ?? {})) {
        verdicts.set(id, readReceipt(receipt))
      }
    } catch (e) {
      console.error('[push] relevé des reçus impossible', e)
    }
  }
  // Anything Expo did not mention has no verdict yet.
  for (const id of ids) if (!verdicts.has(id)) verdicts.set(id, { status: 'pending' })
  return verdicts
}

/**
 * One receipt, reduced to what is worth acting on and worth logging.
 *
 * The platform's own words are kept because they are the only thing that ever
 * names the cause: FCM answers a misfiled service account with a paragraph
 * naming the project it expected, which is what turned an afternoon of
 * guessing into a one-line diagnosis.
 */
function readReceipt(receipt: ExpoReceipt): ReceiptVerdict {
  if (receipt.status === 'ok') return { status: 'ok' }
  const fcm = receipt.details?.fcm?.response
  const platform = typeof fcm === 'string'
    ? (fcm.match(/"message":\s*"([^"]{0,300})/)?.[1] ?? fcm.slice(0, 300))
    : undefined
  return {
    status: 'error',
    error: receipt.details?.error,
    message: receipt.message,
    ...(platform ? { platform } : {}),
  }
}
