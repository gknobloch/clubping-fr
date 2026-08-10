import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { DevUser, User } from '@/types'
import { mockClubs, mockTeams, mockUsers, getDisplayNameForUser, getRoleLabel } from '@/mock/data'
import {
  devLogin as apiDevLogin,
  fetchDevUsers,
  fetchMe,
  logout as apiLogout,
  oauthLogin,
  requestEmailCode,
  verifyEmailCode,
} from '@/lib/authApi'

const SESSION_KEY = 'pp-club-session'
const DEV_USER_KEY = 'clubping-dev-user-id'

// Defensive localStorage access (guards SSR and test environments without a
// working Storage implementation).
const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

// Dev login ("pick any user") stays available in dev builds / E2E (the E2E
// server runs `vite dev` with no backend, so real auth can't be exercised there).
// eslint-disable-next-line react-refresh/only-export-components
export const DEV_LOGIN = import.meta.env.DEV || import.meta.env.VITE_DEV_LOGIN === 'true'

// Fallback list for local `vite dev` and E2E, where there is no backend at all.
// On a preview the real list is fetched from /api/auth/dev/users instead — see
// devUsers below. Enriched and ordered exactly as that endpoint does (#345), so
// the picker has one shape to render whichever list it got.
const allSelectableUsers: DevUser[] = mockUsers
  .map((u): DevUser => {
    const captainOf = mockTeams
      .filter((t) => t.captainId === u.id && !t.isArchived)
      .map((t) => t.number)
      .sort((a, b) => a - b)
    const club = u.clubId ? mockClubs.find((c) => c.id === u.clubId) : undefined
    return {
      ...u,
      ...(club ? { clubName: club.displayName } : {}),
      ...(captainOf.length > 0 ? { captainOf } : {}),
    }
  })
  .sort((a, b) => {
    const rank = (r: User['role']) =>
      r === 'general_admin' ? 0 : r === 'club_admin' ? 1 : 2
    return (
      rank(a.role) - rank(b.role) ||
      (a.lastName ?? '').localeCompare(b.lastName ?? '') ||
      (a.firstName ?? '').localeCompare(b.firstName ?? '') ||
      (a.email ?? '').localeCompare(b.email ?? '')
    )
  })

interface AuthContextValue {
  user: User | null
  /** Session token for the real auth session (null for dev login). */
  token: string | null
  displayName: string
  roleLabel: string
  isAuthenticated: boolean
  loading: boolean
  /** Real auth */
  requestCode: (email: string) => Promise<{ devCode?: string }>
  verifyCode: (email: string, code: string) => Promise<void>
  loginWithIdToken: (provider: 'google' | 'apple', idToken: string) => Promise<void>
  logout: () => void
  /** Dev login (gated by DEV_LOGIN) */
  devUsers: DevUser[]
  devLoginAs: (userId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Real authenticated session (email OTP / OAuth).
  const [realUser, setRealUser] = useState<User | null>(null)
  const [realToken, setRealToken] = useState<string | null>(null)
  // Dev-login selection (no server session).
  const [devUserId, setDevUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // The picker's list, and whether the backend can mint a session for it.
  // Defaults to the mock fixtures so local dev and E2E, which have no backend,
  // behave exactly as before.
  const [devUsers, setDevUsers] = useState<DevUser[]>(allSelectableUsers)
  const [serverDevLogin, setServerDevLogin] = useState(false)

  // A preview exposes /api/auth/dev/users; anywhere else this 404s or fails
  // outright, and the mock list stands (#313).
  useEffect(() => {
    if (!DEV_LOGIN) return
    let cancelled = false
    fetchDevUsers()
      .then((users) => {
        if (cancelled || users.length === 0) return
        setDevUsers(users)
        setServerDevLogin(true)
      })
      .catch(() => {
        /* no server-side dev login here — keep the mock list */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Restore a persisted session on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = storage.get(SESSION_KEY)
        if (token) {
          try {
            const me = await fetchMe(token)
            if (!cancelled) {
              setRealUser(me)
              setRealToken(token)
            }
            return
          } catch {
            storage.remove(SESSION_KEY) // expired / revoked
          }
        }
        if (DEV_LOGIN) {
          const stored = storage.get(DEV_USER_KEY)
          if (stored && !cancelled) setDevUserId(stored)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const devUser = useMemo(
    () => (devUserId ? (devUsers.find((u) => u.id === devUserId) ?? null) : null),
    [devUserId, devUsers],
  )

  const user = realUser ?? devUser

  const applySession = useCallback((token: string, sessionUser: User) => {
    storage.set(SESSION_KEY, token)
    storage.remove(DEV_USER_KEY)
    setRealToken(token)
    setRealUser(sessionUser)
    setDevUserId(null)
  }, [])

  const requestCode = useCallback(async (email: string) => {
    const { devCode } = await requestEmailCode(email)
    return { devCode }
  }, [])

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const session = await verifyEmailCode(email, code)
      applySession(session.token, session.user)
    },
    [applySession],
  )

  const loginWithIdToken = useCallback(
    async (provider: 'google' | 'apple', idToken: string) => {
      const session = await oauthLogin(provider, idToken)
      applySession(session.token, session.user)
    },
    [applySession],
  )

  const logout = useCallback(() => {
    if (realToken) apiLogout(realToken)
    storage.remove(SESSION_KEY)
    storage.remove(DEV_USER_KEY)
    setRealUser(null)
    setRealToken(null)
    setDevUserId(null)
  }, [realToken])

  const devLoginAs = useCallback(
    async (userId: string) => {
      if (!DEV_LOGIN) return
      // On a preview, take a real session — the selection alone authenticates
      // nothing, and every API call would come back 401 (#313).
      if (serverDevLogin) {
        const session = await apiDevLogin(userId)
        applySession(session.token, session.user)
        return
      }
      // Local dev / E2E: no backend to ask, so the selection is the session.
      setDevUserId(userId)
      storage.set(DEV_USER_KEY, userId)
    },
    [serverDevLogin, applySession],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token: realToken,
      displayName: user ? getDisplayNameForUser(user) : '',
      roleLabel: user ? getRoleLabel(user.role) : '',
      isAuthenticated: !!user,
      loading,
      requestCode,
      verifyCode,
      loginWithIdToken,
      logout,
      devUsers: DEV_LOGIN ? devUsers : [],
      devLoginAs,
    }),
    // devUsers matters: the list arrives asynchronously on a preview, and
    // omitting it would leave the picker showing the mock fallback forever.
    [user, realToken, loading, requestCode, verifyCode, loginWithIdToken, logout, devUsers, devLoginAs],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook and provider are intentionally in the same file for co-location
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
