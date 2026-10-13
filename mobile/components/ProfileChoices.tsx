import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { selection } from '@/components/Selection'
import { Avatar } from '@/components/Avatar'
import { getRoleLabel } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { profileName, profilesByClub } from '@shared/lib/profiles'
import type { Profile } from '@shared/types'

/**
 * The profiles of the signed-in person, by club, and a tap to become one
 * (#640) — a parent opening their child's matches. One list for the header's
 * account menu and the « Changer de profil » sheet of Compte (#720), so the
 * two cannot drift: the web's `ProfileList` is the same rows.
 *
 * Switching lands on the Accueil: the screen underneath was the previous
 * profile's, and may be one the next cannot open (a club's admin sections,
 * under a child who only plays).
 */
export function ProfileChoices({
  includeCurrent = false,
  onSwitched,
}: {
  /** The sheet lists the current profile too, marked; the menu has it on top already. */
  includeCurrent?: boolean
  onSwitched: () => void
}) {
  const { user, profiles, switchProfile } = useAuth()
  const { players } = useAppData()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function choose(p: Profile) {
    if (p.id === user?.id || busy) return
    setBusy(p.id)
    try {
      await switchProfile(p.id)
      onSwitched()
      router.replace('/')
    } catch {
      Alert.alert('Erreur', 'Impossible de changer de profil. Vérifiez votre connexion.')
    } finally {
      setBusy(null)
    }
  }

  const listed = includeCurrent ? profiles : profiles.filter((p) => p.id !== user?.id)
  return (
    <>
      {profilesByClub(listed).map((club) => (
        <View key={club.clubId ?? club.clubName}>
          <Text style={selection.sectionLabel}>{club.clubName}</Text>
          {club.profiles.map((p) => {
            const current = p.id === user?.id
            return (
              <TouchableOpacity
                key={p.id}
                testID={`profile-${p.id}`}
                style={s.row}
                onPress={() => choose(p)}
                disabled={current || !!busy}
                accessibilityRole="button"
                accessibilityState={{ selected: current, disabled: current || !!busy }}
                accessibilityLabel={current ? `${profileName(p)}, profil actuel` : profileName(p)}
              >
                <Avatar
                  playerId={p.id}
                  avatarUpdatedAt={players.find((x) => x.id === p.id)?.avatarUpdatedAt}
                  firstName={p.firstName}
                  lastName={p.lastName}
                  size={36}
                />
                <View style={s.body}>
                  <Text style={[s.name, current && s.nameCurrent]} numberOfLines={1}>{profileName(p)}</Text>
                  <Text style={s.role}>
                    {getRoleLabel(p.role)}
                    {p.status === 'archived' ? ' · Archivé' : ''}
                  </Text>
                </View>
                {current ? (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>Profil actuel</Text>
                  </View>
                ) : busy === p.id ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  nameCurrent: { fontFamily: fonts.semiBold, color: colors.accent },
  role: { fontSize: 12, color: colors.textSecondary },
  badge: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.accent },
})
