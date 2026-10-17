import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import { ProfileChoices } from '@/components/ProfileChoices'
import { MODAL_ORIENTATIONS } from '@/components/Sheet'
import { getRoleLabel } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { hasOtherProfiles, managedSession, profileClubName } from '@shared/lib/profiles'
import type { Profile } from '@shared/types'

/** Where the menu hangs: just under the header bar, by the avatar. */
const MENU_WIDTH = 320
const EDGE = 12

/**
 * The header avatar's menu (#720): who is signed in — name, club, role — and
 * the way to Compte, then every profile the person may open (#749): their
 * clubs, then the profiles delegated to them, the current one ticked.
 * Switching used to sit at the bottom of Compte, two screens from where a
 * parent opens a child's matches.
 *
 * A popover hung under the avatar, not a sheet from the bottom: it answers the
 * avatar, and it is short. A `Modal` all the same — anything on top of the
 * navigator is — so it turns with the phone (#625).
 */
export function AccountMenu({ top, onClose }: {
  /** The header's bottom edge, in window coordinates. */
  top: number
  onClose: () => void
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { user, profiles, displayName } = useAuth()
  const { players, users, clubs } = useAppData()
  if (!user) return null

  // The person's photo (#741) — on `users` too, for a profile that does not play.
  const player = players.find((p) => p.id === user.id) ?? users.find((u) => u.id === user.id)
  // The server names the club with the profile; `/api/data` for a session
  // restored before the profiles came back.
  const current: Profile = profiles.find((p) => p.id === user.id) ?? {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    clubId: user.clubId,
    clubName: clubs.find((c) => c.id === user.clubId)?.displayName,
  }
  const clubName = current.clubId || user.role === 'general_admin' ? profileClubName(current) : undefined
  const managed = !!managedSession(profiles, user.id)
  const others = hasOtherProfiles(profiles, user.id)

  const openCompte = () => {
    onClose()
    router.push('/compte')
  }

  return (
    <Modal transparent animationType="fade" supportedOrientations={MODAL_ORIENTATIONS} onRequestClose={onClose}>
      {/* Behind the card, not around it — the rule of Sheet (#625). */}
      <Pressable
        testID="account-menu-backdrop"
        style={[StyleSheet.absoluteFill, s.backdrop]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
      />
      <View
        testID="account-menu"
        style={[
          s.card,
          {
            top,
            right: EDGE + insets.right,
            width: Math.min(MENU_WIDTH, width - 2 * EDGE - insets.left - insets.right),
            maxHeight: height - top - Math.max(insets.bottom, EDGE),
          },
        ]}
      >
        <View style={s.who}>
          <ProfileAvatar profile={current} avatarUpdatedAt={player?.avatarUpdatedAt} size={44} managed={managed} />
          <View style={s.whoText}>
            <Text style={s.name} numberOfLines={1}>{displayName}</Text>
            <Text style={s.club} numberOfLines={1}>
              {[clubName, getRoleLabel(user.role)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          testID="account-menu-compte"
          style={s.link}
          onPress={openCompte}
          accessibilityRole="button"
        >
          <Ionicons name="person-outline" size={18} color={colors.textPrimary} />
          <Text style={s.linkText}>Mon compte</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {others && (
          // Shrinks under the capped card, or a long list pushes it off the
          // screen: React Native does not shrink by default (#623).
          <ScrollView style={s.others} contentContainerStyle={s.othersContent}>
            <ProfileChoices onSwitched={onClose} />
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.2)' },
  card: {
    position: 'absolute', backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  whoText: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  club: { fontSize: 13, color: colors.textSecondary },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  linkText: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  others: { flexShrink: 1, borderTopWidth: 1, borderTopColor: colors.border },
  othersContent: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 },
})
