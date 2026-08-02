import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import * as AppleAuthentication from 'expo-apple-authentication'
import type { User } from '@shared/types'
import { getDisplayName, getRoleLabel } from '@/utils/roles'
import {
  fetchMe,
  logout as apiLogout,
  oauthLogin,
  requestEmailCode,
  setSessionToken,
  verifyEmailCode,
} from '@/utils/api'
import { IS_DEPLOYED_API } from '@/constants/api'

// Real session token (SecureStore) and the legacy dev user-id (AsyncStorage).
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
  availableUsers: User[]
  devLoginAs: (userId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
interface AuthProviderProps {
  children: React.ReactNode
  apiUsers?: User[]
}

export function AuthProvider({ children, apiUsers = [] }: AuthProviderProps) {
  // Real authenticated session (email OTP / OAuth).
  const [realUser, setRealUser] = useState<User | null>(null)
  const [realToken, setRealToken] = useState<string | null>(null)
  // Dev-login selection (no server session).
  const [devUserId, setDevUserId] = useState<string | null>(null)
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
              setRealUser(me)
              setRealToken(token)
            }
            return
          } catch {
            setSessionToken(null)
            await SecureStore.deleteItemAsync(SESSION_KEY) // expired / revoked
          }
        }
        if (DEV_LOGIN) {
          const stored = await AsyncStorage.getItem(DEV_USER_KEY)
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

  // Every player is now a user, so the API user list already covers all accounts.
  const allUsers = useMemo<User[]>(() => (DEV_LOGIN ? apiUsers : []), [apiUsers])

  const devUser = useMemo(
    () => (devUserId ? (allUsers.find((u) => u.id === devUserId) ?? null) : null),
    [devUserId, allUsers],
  )

  const user = realUser ?? devUser

  // --- Real auth actions ---
  const applySession = useCallback(async (token: string, sessionUser: User) => {
    await SecureStore.setItemAsync(SESSION_KEY, token)
    setSessionToken(token) // triggers a DataContext refetch with the session
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
    setRealUser(null)
    setRealToken(null)
    setDevUserId(null)
  }, [realToken])

  // --- Dev login ---
  const devLoginAs = useCallback(async (userId: string) => {
    if (!DEV_LOGIN) return
    setDevUserId(userId)
    await AsyncStorage.setItem(DEV_USER_KEY, userId)
  }, [])

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
      availableUsers: DEV_LOGIN ? allUsers : [],
      devLoginAs,
    }),
    [user, loading, allUsers, requestCode, verifyCode, loginWithIdToken, loginWithApple, logout, devLoginAs],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
