import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail, sendEmails } from './email'
import type { Env } from './auth'

// #474 — the app now writes to *clubs*, at addresses read off a federation
// listing. A preview or a local run that could reach one is a preview that can
// mail a real club by accident, so the redirect below is the safety net the
// whole onboarding flow leans on. These tests are mostly about it holding.

const env = (over: Partial<Env['Bindings']> = {}) =>
  ({ RESEND_API_KEY: 'key', RESEND_FROM: 'Club Ping <no-reply@example.fr>', ...over }) as Env['Bindings']

const message = { to: 'club@example.fr', subject: 'Sujet', text: 'Corps du message.' }

/** The JSON body Resend was handed, or null when nothing was sent. */
const sentBody = () => {
  const call = vi.mocked(globalThis.fetch).mock.calls[0]
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sendEmail — the real recipient (#474)', () => {
  it('sends to the address given when nothing redirects', async () => {
    const result = await sendEmail(env(), message)
    expect(result).toEqual({ to: 'club@example.fr', sent: true })
    expect(sentBody().to).toEqual(['club@example.fr'])
    expect(sentBody().headers).toBeUndefined()
  })
})

describe('sendEmail — the dev redirect (#474)', () => {
  const dev = env({ EMAIL_REDIRECT_TO: 'clubping.dev@leskno.fr' })

  it('diverts every recipient to the one address', async () => {
    const result = await sendEmail(dev, message)
    expect(result).toEqual({
      to: 'clubping.dev@leskno.fr',
      redirectedFrom: 'club@example.fr',
      sent: true,
    })
    expect(sentBody().to).toEqual(['clubping.dev@leskno.fr'])
  })

  it('names the intended recipient in a header', async () => {
    await sendEmail(dev, message)
    expect(sentBody().headers).toEqual({ 'X-Original-Recipient': 'club@example.fr' })
  })

  // A header is invisible in most mail clients, and the person reading a
  // redirected message is precisely the one who needs to know who it was for.
  it('says so in the body too, above the message', async () => {
    await sendEmail(dev, message)
    const text: string = sentBody().text
    expect(text).toContain('club@example.fr')
    expect(text).toContain('DEV')
    expect(text.indexOf('club@example.fr')).toBeLessThan(text.indexOf('Corps du message.'))
    // The message itself survives intact underneath the notice.
    expect(text).toContain('Corps du message.')
  })

  it('adds nothing when the redirect target is already the recipient', async () => {
    await sendEmail(env({ EMAIL_REDIRECT_TO: 'club@example.fr' }), message)
    expect(sentBody().headers).toBeUndefined()
    expect(sentBody().text).toBe('Corps du message.')
  })

  it('ignores a blank setting rather than diverting to nowhere', async () => {
    const result = await sendEmail(env({ EMAIL_REDIRECT_TO: '   ' }), message)
    expect(result.to).toBe('club@example.fr')
  })
})

describe('sendEmail — no Resend key (#474)', () => {
  it('logs instead of sending, as local dev has always relied on', async () => {
    const result = await sendEmail(env({ RESEND_API_KEY: undefined }), message)
    expect(result.sent).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  // Reading a dev log should not be a way to see which club addresses the app
  // would have written to.
  it('redirects the log line too', async () => {
    const log = vi.mocked(console.log)
    await sendEmail(env({ RESEND_API_KEY: undefined, EMAIL_REDIRECT_TO: 'dev@example.fr' }), message)
    expect(log.mock.calls[0][0]).toContain('to=dev@example.fr')
    expect(log.mock.calls[0][0]).toContain('redirigé depuis club@example.fr')
  })
})

describe('sendEmails (#474)', () => {
  it('sends each one', async () => {
    const results = await sendEmails(env(), [message, { ...message, to: 'b@example.fr' }])
    expect(results).toHaveLength(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  // A decision notifies two parties and a submission notifies every admin.
  // None of that is worth failing the state change that has already happened.
  it('does not let one failure lose the others', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const results = await sendEmails(env(), [message, { ...message, to: 'b@example.fr' }])
    expect(results).toHaveLength(1)
    expect(results[0].to).toBe('b@example.fr')
  })

  it('reports a Resend rejection rather than pretending it sent', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('nope', { status: 422 }))
    await expect(sendEmail(env(), message)).rejects.toThrow('email_send_failed')
  })
})
