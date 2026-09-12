import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import * as AppleAuthentication from 'expo-apple-authentication'
import type { DevUser, User } from '@shared/types'
import { getDisplayName, getRoleLabel } from '@/utils/roles'
import {
  devLogin as apiDevLogin,
  fetchDevUsers,
  fetchMe,
  logout as apiLogout,
  oauthLogin,
  requestEmailCode,
  setSession,
  verifyEmailCode,
} from '@/utils/api'
import { IS_PRODUCTION_API } from '@/constants/api'
import { forgetPush } from '@/utils/push'

// Real session token (SecureStore) and the pre-#358 dev user-id (AsyncStorage),
// kept only so an old install's leftover is cleared on logout.
const SESSION_KEY = 'pp-club-session'
const DEV_USER_KEY = 'clubping-user-id'

/**
 * The signed-in member, kept so a boot with no network can restore the session
 * instead of showing the sign-in form (#513, mirroring the web's #387).
 *
 * Identity only — everything the app renders comes from DataContext's own
 * cache. AsyncStorage rather than SecureStore because this is not a credential:
 * it names who the session belongs to, and the offline cache next to it already
 * holds far more about the same person. The token stays in SecureStore.
 */
const USER_KEY = 'pp-club-user'

/**
 * Did the server turn us away, or did we never reach it? Only the first should
 * cost the member their session.
 *
 * `fetch` rejects with a bare TypeError when there is no network; an expired or
 * revoked token comes back through `parse` as an ApiError carrying a status.
 * Treating the two alike is what made an offline cold start sign a member out
 * of an app they could no longer sign into — reconnecting needs a code by
 * e-mail, and so does the network they do not have.
 */
function isServerRejection(err: unknown): boolean {
  return typeof (err as { status?: number } | null)?.status === 'number'
}

async function readStoredUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY)
    if (!raw) return null
    const user = JSON.parse(raw) as User
    return user && typeof user.id === 'string' ? user : null
  } catch {
    return null
  }
}

// Dev login ("pick any user") is available in dev builds (or when explicitly
// enabled) so local dev doesn't need a real email/OAuth — but NEVER against
// production, which is the one backend we must not even ask for a user list.
//
// Whether it actually appears is the backend's call, not this flag's: the
// picker lists what `GET /api/auth/dev/users` returns, and that endpoint
// answers 404 unless DEV_LOGIN_ENABLED is set. So a local server and a PR
// preview both work — the preview being the anonymised database the web PRs
// are tested on (#452).
export const DEV_LOGIN =
  !IS_PRODUCTION_API &&
  ((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEV_LOGIN === 'true')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AuthContextValue {
  user: User | null
  displayName: string
  roleLabel: string
  isAuthenticated: boolean
  loading: boolean
  /** Real auth */
  requestCode: (email: string) => Promise<{ devCode?: string }>
  verifyCode: (email: string, code: string) => Promise<void>
  loginWithIdToken: (provider: 'google' | 'apple', idToken: string) => Promise<void>
  loginWithApple: () => Promise<void>
  logout: () => Promise<void>
  /** Dev login (gated by DEV_LOGIN) */
  availableUsers: DevUser[]
  devLoginAs: (userId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Real authenticated session (email OTP / OAuth, and dev login — which now
  // mints one too).
  const [user, setUser] = useState<User | null>(null)
  const [realToken, setRealToken] = useState<string | null>(null)
  // The dev picker's list, straight from the backend.
  const [devUsers, setDevUsers] = useState<DevUser[]>([])
  const [loading, setLoading] = useState(true)

  // Restore a persisted session on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await SecureStore.getItemAsync(SESSION_KEY)
        if (token) {
          // Who we last knew this session to belong to, published before the
          // network is consulted: DataContext keys its offline cache on it
          // (#509), and on a boot with no signal there will be no later answer.
          const stored = await readStoredUser()
          setSession(token, stored?.id ?? null) // let DataContext authenticate its fetch
          try {
            const me = await fetchMe(token)
            if (!cancelled) {
              setUser(me)
              setRealToken(token)
              setSession(token, me.id)
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(me))
            }
            return
          } catch (err) {
            if (!isServerRejection(err)) {
              // Offline, not signed out. Dropping the token here meant a sports
              // hall with no signal showed the sign-in form — and, through
              // DataContext's logout handler, took the offline cache with it:
              // the one thing that boot existed to read (#513).
              if (stored && !cancelled) {
                setUser(stored)
                setRealToken(token)
                return
              }
              // No stored member to fall back on (an install that predates
              // this, or storage that refused). The sign-in screen is all we
              // can show — but the session is still not ours to destroy over a
              // request that never arrived, and clearing the token holder here
              // would reach DataContext's logout handler and wipe the cache for
              // exactly the reason this change exists. Leave both alone; the
              // next launch with a network settles it.
              return
            }
            // A stated refusal — expired or revoked. Now it goes.
            setSession(null, null)
            await SecureStore.deleteItemAsync(SESSION_KEY)
            await AsyncStorage.removeItem(USER_KEY)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // The picker's list. It has to come from this sessionless endpoint: on the
  // login screen there is no session yet, so `GET /api/data` — which used to
  // feed the picker — answers 401 and left it empty (#358). A 404 here just
  // means the backend has no dev login, and the picker stays empty.
  useEffect(() => {
    if (!DEV_LOGIN) return
    let cancelled = false
    fetchDevUsers()
      .then((users) => {
        if (!cancelled) setDevUsers(users)
      })
      .catch(() => {
        /* no server-side dev login here */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // --- Real auth actions ---
  const applySession = useCallback(async (token: string, sessionUser: User) => {
    await SecureStore.setItemAsync(SESSION_KEY, token)
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(sessionUser))
    setSession(token, sessionUser.id) // triggers a DataContext refetch with the session
    setRealToken(token)
    setUser(sessionUser)
  }, [])

  const requestCode = useCallback(async (email: string) => {
    const { devCode } = await requestEmailCode(email)
    return { devCode }
  }, [])

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const session = await verifyEmailCode(email, code)
      await applySession(session.token, session.user)
    },
    [applySession],
  )

  const loginWithIdToken = useCallback(
    async (provider: 'google' | 'apple', idToken: string) => {
      const session = await oauthLogin(provider, idToken)
      await applySession(session.token, session.user)
    },
    [applySession],
  )

  const loginWithApple = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
    if (!credential.identityToken) throw new Error('apple_no_token')
    await loginWithIdToken('apple', credential.identityToken)
  }, [loginWithIdToken])

  const logout = useCallback(async () => {
    // Before the session goes, not after: deregistering the device needs one,
    // and a phone that keeps its token after sign-out keeps ringing with the
    // matches of whoever was signed in (#495). Never fails the logout.
    await forgetPush()
    if (realToken) await apiLogout(realToken)
    setSession(null, null)
    await SecureStore.deleteItemAsync(SESSION_KEY)
    await AsyncStorage.removeItem(USER_KEY)
    await AsyncStorage.removeItem(DEV_USER_KEY)
    setUser(null)
    setRealToken(null)
  }, [realToken])

  // --- Dev login ---
  // Takes a real session like every other login path: a bare selection
  // authenticates nothing, and the local API rejects sessionless calls since
  // #138, so the picked user landed on empty screens (#358).
  const devLoginAs = useCallback(
    async (userId: string) => {
      if (!DEV_LOGIN) return
      const session = await apiDevLogin(userId)
      await applySession(session.token, session.user)
    },
    [applySession],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      displayName: user ? getDisplayName(user) : '',
      roleLabel: user ? getRoleLabel(user.role) : '',
      isAuthenticated: !!user,
      loading,
      requestCode,
      verifyCode,
      loginWithIdToken,
      loginWithApple,
      logout,
      availableUsers: DEV_LOGIN ? devUsers : [],
      devLoginAs,
    }),
    // devUsers matters: the list arrives asynchronously, and omitting it would
    // leave the picker empty for as long as the login screen stays mounted.
    [user, loading, devUsers, requestCode, verifyCode, loginWithIdToken, loginWithApple, logout, devLoginAs],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
