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
  setSessionToken,
  verifyEmailCode,
} from '@/utils/api'
import { IS_DEPLOYED_API } from '@/constants/api'

// Real session token (SecureStore) and the pre-#358 dev user-id (AsyncStorage),
// kept only so an old install's leftover is cleared on logout.
const SESSION_KEY = 'pp-club-session'
const DEV_USER_KEY = 'clubping-user-id'

// Dev login ("pick any user") is available in dev builds (or when explicitly
// enabled) so local dev doesn't need a real email/OAuth — but NEVER when the
// app targets the deployed backend, where it can't work anyway (the API guard
// rejects sessionless dev logins) and would only be confusing.
export const DEV_LOGIN =
  !IS_DEPLOYED_API &&
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
          setSessionToken(token) // let DataContext authenticate its fetch
          try {
            const me = await fetchMe(token)
            if (!cancelled) {
              setUser(me)
              setRealToken(token)
            }
            return
          } catch {
            setSessionToken(null)
            await SecureStore.deleteItemAsync(SESSION_KEY) // expired / revoked
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
    setSessionToken(token) // triggers a DataContext refetch with the session
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
    if (realToken) await apiLogout(realToken)
    setSessionToken(null)
    await SecureStore.deleteItemAsync(SESSION_KEY)
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
