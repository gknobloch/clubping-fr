import type { Env } from './auth'

/**
 * Every e-mail the app sends goes through here (#474).
 *
 * Before this there was one sender, buried in auth.ts, for the one message the
 * app had. The onboarding flow adds four more — and, more to the point, adds
 * messages addressed to **clubs** rather than to the person at the keyboard.
 * That is the difference worth a shared module: a mistake in a sign-in code
 * reaches the person who asked for it, while a mistake here reaches a club
 * whose address we read off a federation listing.
 *
 * Hence the redirect below, which is the whole reason this file exists.
 */

/** One message, before the environment has had its say about where it goes. */
export interface OutgoingEmail {
  to: string
  subject: string
  /** Plain text. Everything the app sends is plain text on purpose — these are
   *  short, transactional notes, and a club's mail client is not worth
   *  guessing at. */
  text: string
}

/**
 * Where a message ends up, once the environment has been consulted.
 *
 * `redirectedFrom` is set when EMAIL_REDIRECT_TO diverted it, and is what the
 * tests assert on: "did this go to the right place" is a question with two
 * different right answers depending on the environment.
 */
export interface EmailDelivery {
  to: string
  redirectedFrom?: string
  /** False when there is no Resend key — the message was logged, not sent. */
  sent: boolean
}

const REDIRECT_NOTICE = (original: string) =>
  [
    '=========================================================',
    ` DEV — ce message était destiné à : ${original}`,
    ' Il a été redirigé parce que EMAIL_REDIRECT_TO est défini.',
    '=========================================================',
    '',
    '',
  ].join('\n')

/**
 * Send one message.
 *
 * Two environment switches, and they are independent:
 *
 * - **EMAIL_REDIRECT_TO** — every recipient is replaced by this address. The
 *   original is preserved in an `X-Original-Recipient` header *and* spelled out
 *   at the top of the body, because a header is invisible in most mail clients
 *   and the person reading a redirected message needs to know who it was for.
 *   Set on preview and in local dev; never in production.
 * - **RESEND_API_KEY** — absent, nothing is sent and the message is logged.
 *   That is how local dev has always worked for the sign-in code.
 *
 * The redirect is checked first and applies to the log line too: reading a dev
 * log should not be a way to see which club addresses the app would have
 * written to.
 */
export async function sendEmail(env: Env['Bindings'], email: OutgoingEmail): Promise<EmailDelivery> {
  const redirectTo = env.EMAIL_REDIRECT_TO?.trim()
  const redirected = Boolean(redirectTo) && redirectTo !== email.to
  const to = redirectTo || email.to
  const text = redirected ? REDIRECT_NOTICE(email.to) + email.text : email.text

  if (!env.RESEND_API_KEY) {
    console.log(
      `[email] to=${to}${redirected ? ` (redirigé depuis ${email.to})` : ''} subject=${email.subject}\n${text}`,
    )
    return { to, ...(redirected ? { redirectedFrom: email.to } : {}), sent: false }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? 'Club Ping <onboarding@resend.dev>',
      to: [to],
      subject: email.subject,
      text,
      ...(redirected ? { headers: { 'X-Original-Recipient': email.to } } : {}),
    }),
  })
  if (!res.ok) {
    console.error('[email] Resend send failed', res.status, await res.text())
    throw new Error('email_send_failed')
  }
  return { to, ...(redirected ? { redirectedFrom: email.to } : {}), sent: true }
}

/**
 * Send several messages, and never let one failure lose the others.
 *
 * A decision notifies the requester *and* the club; a submitted request
 * notifies every general admin. None of those is worth failing the request
 * that triggered it — the state change has already happened, and the caller
 * cannot usefully undo it because someone else's mail server was down.
 */
export async function sendEmails(
  env: Env['Bindings'],
  emails: OutgoingEmail[],
): Promise<EmailDelivery[]> {
  const results = await Promise.allSettled(emails.map((e) => sendEmail(env, e)))
  return results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return [r.value]
    console.error(`[email] could not send "${emails[i].subject}"`, r.reason)
    return []
  })
}
