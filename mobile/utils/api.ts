import type { Delegations, DevUser, Profile, User } from '@shared/types'
import { apiUrl, clientHeaders } from '@/constants/api'

// ---------------------------------------------------------------------------
// Session holder — AuthContext sets it; DataContext reads it for the
// Authorization header and subscribes to changes to refetch after login.
// (DataProvider wraps AuthProvider, so a module holder decouples them.)
//
// It carries the member alongside the token, because DataContext has to key its
// offline cache to somebody and cannot reach `useAuth()` from outside the
// provider (#509). One setter for both, so a token can never be published
// without saying whose it is — the cache would then be written under nobody,
// which is how it came to be shared in the first place.
// ---------------------------------------------------------------------------
let currentToken: string | null = null
let currentUserId: string | null = null
const sessionListeners = new Set<() => void>()

export function setSession(token: string | null, userId: string | null): void {
  if (token === currentToken && userId === currentUserId) return
  currentToken = token
  currentUserId = userId
  sessionListeners.forEach((l) => l())
}

export function getSessionToken(): string | null {
  return currentToken
}

/** The signed-in member's id, or null before one is known. */
export function getSessionUserId(): string | null {
  return currentUserId
}

export function onSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

/** Headers for data/mutation requests, including the session token when set. */
export function dataHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...clientHeaders(),
    ...(extra ?? {}),
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
export interface ApiError extends Error {
  status: number
  code?: string
}

function apiError(status: number, code?: string, message?: string): ApiError {
  const e = new Error(message ?? code ?? `HTTP ${status}`) as ApiError
  e.status = status
  e.code = code
  return e
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      ...clientHeaders(),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return parse<T>(res)
}

async function parse<T>(res: Response): Promise<T> {
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error
    throw apiError(res.status, code)
  }
  return data as T
}

/** Fetch with the Bearer token attached. */
export function authFetch(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    headers: { ...clientHeaders(), ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
export interface AuthSession {
  token: string
  user: User
  /**
   * Every profile the address signs in as, the signed-in one included (#640).
   * Optional for a server older than the feature, which sends none.
   */
  profiles?: Profile[]
}

/** Who is signed in, and the other profiles of their address (#640). */
export interface Me {
  user: User
  profiles: Profile[]
}

/** Request an email OTP. `devCode` is only present in local dev (no email provider). */
export function requestEmailCode(email: string): Promise<{ ok: true; devCode?: string }> {
  return postJson('/auth/email/request', { email })
}

export function verifyEmailCode(email: string, code: string): Promise<AuthSession> {
  return postJson('/auth/email/verify', { email, code })
}

export function oauthLogin(provider: 'google' | 'apple', idToken: string): Promise<AuthSession> {
  return postJson('/auth/oauth', { provider, idToken })
}

export async function fetchMe(token: string): Promise<Me> {
  const res = await authFetch('/auth/me', { method: 'GET' }, token)
  const { user, profiles } = await parse<{ user: User; profiles?: Profile[] }>(res)
  return { user, profiles: profiles ?? [] }
}

/**
 * Become another profile of the same address (#640). A new session comes back
 * and the one presented is revoked — so the caller must store the new token
 * before anything else asks the API.
 */
export function switchProfile(userId: string, token: string): Promise<AuthSession> {
  return postJson('/auth/switch', { userId }, token)
}

export async function logout(token: string): Promise<void> {
  await authFetch('/auth/logout', { method: 'POST' }, token).catch(() => {})
}

// --- Dev login (local backend only, #358) -----------------------------------
// Both endpoints are sessionless by design — they are how one obtains a session
// in the first place — and answer 404 unless the backend sets
// DEV_LOGIN_ENABLED. The picker must therefore not read the user list from
// `GET /api/data`, which needs a session and 401s on the login screen (#138).

/** The backend's own users, for the dev picker. Administrators come first. */
export async function fetchDevUsers(): Promise<DevUser[]> {
  const res = await fetch(apiUrl('/auth/dev/users'), { headers: clientHeaders() })
  const { users } = await parse<{ users: DevUser[] }>(res)
  return users
}

/** Sign in as any user, with no credential. Returns a real session. */
export function devLogin(userId: string): Promise<AuthSession> {
  return postJson('/auth/dev/login', { userId })
}

// --- Delegation (#655) -------------------------------------------------------
// Awaited, never optimistic, as on the web: the API decides who may, and a list
// that showed a delegation the server refused would be a promise to a parent
// that their child's profiles will open — and they would not.

/** Who may open this person's profiles, and whose they open. */
export async function fetchDelegations(personId: string): Promise<Delegations> {
  const res = await fetch(apiUrl(`/people/${encodeURIComponent(personId)}/delegations`), { headers: dataHeaders() })
  return parse<Delegations>(res)
}

/** The refusals the API words itself (no account, ambiguous, oneself), passed on as written. */
export type DelegateOutcome = { ok: true } | { ok: false; message: string }

/** Name a delegate by the address they sign in with — the person's own gesture. */
export async function addDelegateByEmail(personId: string, email: string): Promise<DelegateOutcome> {
  try {
    const res = await fetch(apiUrl(`/people/${encodeURIComponent(personId)}/delegates`), {
      method: 'POST',
      headers: dataHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    return { ok: false, message: body?.message ?? "L'opération a échoué." }
  } catch {
    return { ok: false, message: 'Connexion indisponible. Réessayez plus tard.' }
  }
}

/** Withdraw a delegation — the person's, or the delegate stepping down. */
export async function removeDelegate(personId: string, delegateId: string): Promise<boolean> {
  try {
    const res = await fetch(
      apiUrl(`/people/${encodeURIComponent(personId)}/delegates/${encodeURIComponent(delegateId)}`),
      { method: 'DELETE', headers: dataHeaders() },
    )
    return res.ok
  } catch {
    return false
  }
}
