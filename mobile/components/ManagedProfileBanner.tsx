import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { managedSession, profileName } from '@shared/lib/profiles'

/**
 * Under the header while the session is somebody else's profile (#749):
 * Nathan, opening Chloé's because she delegated to him (#655), answers her
 * availabilities and sees her matches — and has to know it on every screen,
 * not only in the account menu. One tap goes back to the profile that signed
 * in. The web's ManagedProfileBanner is the same strip.
 *
 * Part of AppHeader, so every navigator has it and nothing scrolls it away.
 * Nothing on one's own profiles: there, the club badge says enough.
 */
export function ManagedProfileBanner({ paddingLeft, paddingRight }: {
  /** The header's own side padding, notch included (#445). */
  paddingLeft: number
  paddingRight: number
}) {
  const { user, profiles, switchProfile } = useAuth()
  const { players, users } = useAppData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const session = managedSession(profiles, user?.id)
  if (!session) return null
  const { current, home } = session

  async function goHome() {
    if (!home || busy) return
    setBusy(true)
    try {
      await switchProfile(home.id)
      router.replace('/')
    } catch {
      Alert.alert('Erreur', 'Impossible de revenir à votre profil. Vérifiez votre connexion.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View testID="managed-profile-banner" style={[s.bar, { paddingLeft, paddingRight }]} accessibilityRole="summary">
      <Text style={s.text} numberOfLines={1}>
        Profil de <Text style={s.name}>{profileName(current)}</Text>
      </Text>
      {home && (
        <TouchableOpacity
          testID="managed-profile-back"
          style={s.back}
          onPress={goHome}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Revenir à mon profil"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Avatar
              playerId={home.id}
              avatarUpdatedAt={(players.find((x) => x.id === home.id) ?? users.find((x) => x.id === home.id))?.avatarUpdatedAt}
              firstName={home.firstName}
              lastName={home.lastName}
              size={22}
            />
          )}
          <Text style={s.backText}>Revenir à mon profil</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4,
    backgroundColor: colors.accentSoft, borderBottomWidth: 1, borderBottomColor: colors.accentSoftBorder,
  },
  text: { flex: 1, fontSize: 14, color: '#8a2020' },
  name: { fontFamily: fonts.semiBold },
  back: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: colors.accentSoftBorder, backgroundColor: '#fff',
  },
  backText: { fontSize: 14, fontFamily: fonts.semiBold, color: '#a82626' },
})
