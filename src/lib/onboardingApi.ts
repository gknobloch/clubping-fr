import type { ClubAdminRequest, ClubAdminRequestSnapshot } from '@/lib/clubAdminRequests'

/**
 * The onboarding request endpoints (#474).
 *
 * Kept apart from DataContext on purpose: requests are not part of the app's
 * dataset. They are a queue that exists before a club does, most members never
 * see one, and the page that creates them runs with no session at all — so
 * putting them in the payload every client fetches on every load would be
 * paying for them everywhere to use them in one place.
 */

export interface ClubAdminRequestError extends Error {
  status: number
  code?: string
}

function requestError(status: number, code?: string, message?: string): ClubAdminRequestError {
  const e = new Error(message ?? code ?? `HTTP ${status}`) as ClubAdminRequestError
  e.status = status
  e.code = code
  return e
}

async function parse<T>(res: Response): Promise<T> {
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const body = data as { error?: string; message?: string } | null
    throw requestError(res.status, body?.error, body?.message)
  }
  return data as T
}

/** What the requester's browser read from FFTT, sent along with the form. */
export interface SubmitClubAdminRequest {
  affiliationNumber: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  message?: string
  snapshot: ClubAdminRequestSnapshot
}

/**
 * Ask to administer a club. Deliberately sends no credentials — this is the
 * one write the app accepts from a stranger, because sign-in cannot yet reach
 * someone whose club it has never heard of.
 */
export function submitClubAdminRequest(body: SubmitClubAdminRequest): Promise<{ ok: true }> {
  return fetch('/api/onboarding/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parse<{ ok: true }>)
}

/** The queue, newest first. General admins only. */
export function fetchClubAdminRequests(headers: HeadersInit): Promise<{ requests: ClubAdminRequest[] }> {
  return fetch('/api/onboarding/requests', { headers }).then(parse<{ requests: ClubAdminRequest[] }>)
}

export interface DecideClubAdminRequest {
  status: 'approved' | 'rejected'
  note?: string
  /**
   * The club as the general admin confirmed it against FFTT, used only when
   * approving a request whose club does not exist yet. It comes from the live
   * re-read on the review screen, never from the requester's own submission.
   */
  club?: { displayName?: string; venueLabel?: string; street?: string; postalCode?: string; city?: string }
}

export function decideClubAdminRequest(
  id: string,
  decision: DecideClubAdminRequest,
  headers: HeadersInit,
): Promise<{ ok: true; clubId?: string; createdClub?: boolean }> {
  return fetch(`/api/onboarding/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
    body: JSON.stringify(decision),
  }).then(parse<{ ok: true; clubId?: string; createdClub?: boolean }>)
}
