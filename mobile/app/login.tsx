import { useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
  ImageBackground,
  KeyboardAvoidingView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// Welcome background. Swap this file to change the image (see issue #113).
// Photo: Pexels (free license, no attribution required). require() is the
// standard way to bundle a static image asset in React Native.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const welcomeBg = require('../assets/welcome-bg.jpg')
import { useAuth, DEV_LOGIN } from '@/contexts/AuthContext'
import { getRoleLabel, getDisplayName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import type { ApiError } from '@/utils/api'
import type { DevUser } from '@shared/types'
import { displayFonts, fonts } from '@/constants/typography'

// Google + Apple sign-in have been removed from the UI until the OAuth
// client IDs are configured (#129 / #100). `loginWithIdToken` /
// `loginWithApple` in AuthContext, `usesAppleSignIn` in app.json, and the
// expo-auth-session / expo-apple-authentication deps stay in place so
// re-enabling is a small change.

// Map backend error codes to French messages.
function authErrorMessage(e: unknown): string {
  const code = (e as ApiError)?.code
  switch (code) {
    case 'invalid_code':
      return 'Code invalide ou expiré.'
    case 'too_many_attempts':
      return 'Trop de tentatives. Demandez un nouveau code.'
    case 'no_account':
      return 'Aucun compte associé à cet e-mail.'
    case 'invalid_email':
      return 'Adresse e-mail invalide.'
    default:
      return 'Une erreur est survenue. Réessayez.'
  }
}

export default function LoginScreen() {
  const { requestCode, verifyCode } = useAuth()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequestCode() {
    if (!email.includes('@')) {
      setError('Adresse e-mail invalide.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { devCode: issuedCode } = await requestCode(email.trim())
      setDevCode(issuedCode ?? null)
      setStep('code')
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify() {
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email.trim(), code.trim())
      // On success the AuthGuard navigates away.
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ImageBackground source={welcomeBg} style={styles.container} resizeMode="cover">
      <LinearGradient
        colors={['rgba(10,15,28,0.55)', 'rgba(10,15,28,0.25)', 'rgba(10,15,28,0.65)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandBlock}>
              <Text style={styles.brand}>Club Ping</Text>
              <Text style={styles.tagline}>
                {step === 'email' ? 'Connectez-vous pour continuer' : `Code envoyé à ${email}`}
              </Text>
            </View>

            <View style={styles.spacer} />

            <View style={styles.formCard}>
              {error && <Text style={styles.error}>{error}</Text>}

              {step === 'email' ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Adresse e-mail"
                    placeholderTextColor={colors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    editable={!busy}
                  />
                  <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={handleRequestCode}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Recevoir un code</Text>
                    )}
                  </TouchableOpacity>

                  {/* Google + Apple sign-in are hidden until the OAuth client
                      IDs are configured (#129 / #100). The handlers and wiring
                      below stay in place so we can re-enable the buttons with
                      a one-line change. */}
                </>
              ) : (
                <>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="123456"
                    placeholderTextColor={colors.textSecondary}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoFocus
                    editable={!busy}
                  />
                  {devCode && <Text style={styles.devCode}>Code (dev) : {devCode}</Text>}
                  <TouchableOpacity
                    style={[styles.primaryBtn, (busy || code.length < 6) && styles.btnDisabled]}
                    onPress={handleVerify}
                    disabled={busy || code.length < 6}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Se connecter</Text>
                    )}
                  </TouchableOpacity>
                  <View style={styles.linkRow}>
                    <TouchableOpacity onPress={handleRequestCode} disabled={busy}>
                      <Text style={styles.link}>Renvoyer le code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setStep('email')
                        setCode('')
                        setDevCode(null)
                        setError(null)
                      }}
                      disabled={busy}
                    >
                      <Text style={styles.link}>Modifier l’e-mail</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {DEV_LOGIN && <DevLogin />}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  )
}

// ---------------------------------------------------------------------------
// Dev-only "pick any user" login (hidden behind DEV_LOGIN)
// ---------------------------------------------------------------------------
function DevLogin() {
  const { availableUsers, devLoginAs } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // `/api/auth/dev/users` already orders the list — administrators first, then
  // by name — so filtering is all that is left to do here. Club and role are
  // searchable too, since that is often the only thing one knows to type.
  const users = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return availableUsers
    return availableUsers.filter((u) =>
      [
        getDisplayName(u),
        u.email ?? '',
        u.clubName ?? '',
        getRoleLabel(u.role),
        ...(u.captainOf?.length ? ['capitaine'] : []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [availableUsers, query])

  async function handleSelect(user: DevUser) {
    setSelecting(user.id)
    setError(null)
    try {
      // A round trip that mints a real session, so it has to complete — and it
      // can fail (#358). On success AuthedRoutes swaps the screen.
      await devLoginAs(user.id)
    } catch {
      setError('Connexion impossible pour cet utilisateur.')
    } finally {
      setSelecting(null)
    }
  }

  return (
    <View style={styles.devSection}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)}>
        <Text style={styles.devToggle}>{open ? '▾' : '▸'} Connexion dev (test)</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.devBody}>
          {error && <Text style={styles.error}>{error}</Text>}
          {availableUsers.length === 0 ? (
            <Text style={styles.devEmpty}>
              Aucun utilisateur : l’API locale n’expose pas la connexion dev.
            </Text>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Rechercher…"
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {users.length === 0 && <Text style={styles.devEmpty}>Aucun utilisateur trouvé</Text>}
              {users.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={styles.card}
                  onPress={() => handleSelect(user)}
                  disabled={selecting === user.id}
                >
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{getDisplayName(user)}</Text>
                    <Text style={styles.role}>
                      {[
                        getRoleLabel(user.role),
                        user.captainOf?.length ? `capitaine ${user.captainOf.join(', ')}` : null,
                        user.clubName ?? null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {selecting === user.id && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 64, paddingBottom: 24 },
  brandBlock: { paddingHorizontal: 6 },
  brand: {
    fontSize: 34,
    // The one place the product name is set this large — the display face, as
    // on the web's login h1 (#360). Outfit has no 800 cut loaded; 700 at 34px
    // carries the same weight on screen.
    fontFamily: displayFonts.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  spacer: { flex: 1, minHeight: 24 },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderRadius: 20,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  error: { color: colors.danger, fontSize: 14, fontFamily: fonts.medium },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    // iOS renders TextInput placeholders with stray letter-spacing unless an
    // explicit value is set; pin it to 0 so placeholders track normally (#118).
    letterSpacing: 0,
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  devCode: { color: colors.textSecondary, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.semiBold },
  btnDisabled: { opacity: 0.5 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textSecondary, fontSize: 13 },
  oauthBtn: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  oauthBtnText: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.semiBold },
  appleBtn: { backgroundColor: '#000', borderColor: '#000' },
  appleBtnText: { color: '#fff' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  link: { color: colors.accent, fontSize: 14, fontFamily: fonts.medium },
  // Dev section
  devSection: { marginTop: 24, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  devToggle: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  devBody: { gap: 8, marginTop: 12 },
  devEmpty: { fontSize: 13, color: colors.textSecondary },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardBody: { flex: 1 },
  name: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  role: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
})
