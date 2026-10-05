import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Sheet } from '@/components/Sheet'
import { SelectionList, selection } from '@/components/Selection'
import { Avatar } from '@/components/Avatar'
import { getRoleLabel } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { profileName, profilesByClub } from '@shared/lib/profiles'
import type { Profile } from '@shared/types'

/**
 * The profiles of the signed-in address, by club, and a tap to become one
 * (#640) — a parent opening their child's matches. The web's `ProfileList`,
 * in a sheet.
 *
 * Switching lands on the Accueil: the screen underneath was the previous
 * profile's, and may be one the next cannot open (a club's admin sections,
 * under a child who only plays).
 */
export function ProfileSwitcherSheet({ onClose }: { onClose: () => void }) {
  const { user, profiles, switchProfile } = useAuth()
  const { players } = useAppData()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function choose(p: Profile) {
    if (p.id === user?.id || busy) return
    setBusy(p.id)
    try {
      await switchProfile(p.id)
      onClose()
      router.replace('/')
    } catch {
      Alert.alert('Erreur', 'Impossible de changer de profil. Vérifiez votre connexion.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet onClose={onClose} testID="profile-sheet">
      <Text style={selection.title}>Changer de profil</Text>
      <Text style={s.hint}>Les profils liés à votre adresse e-mail.</Text>
      <SelectionList>
        {profilesByClub(profiles).map((club) => (
          <View key={club.clubId ?? ''}>
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
      </SelectionList>
      <TouchableOpacity testID="profile-sheet-close" style={selection.cancelBtn} onPress={onClose}>
        <Text style={selection.cancelTxt}>Fermer</Text>
      </TouchableOpacity>
    </Sheet>
  )
}

const s = StyleSheet.create({
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
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
