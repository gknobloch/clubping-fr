import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import { colors } from '@/constants/colors'
import { clubInitial } from '@shared/lib/clubTown'
import { profileClubName } from '@shared/lib/profiles'
import type { Profile } from '@shared/types'

// What tells a person's profiles apart (#749): the club, drawn as its logo —
// or its town's initial, when it has none — and a shield for the general
// administration, a role of the person rather than a club (#655). The web's
// ProfileAvatar.tsx is the same pair.

/** A profile's club, as a mark: logo, initial, or the general administration's shield. */
export function ProfileClubMark({ profile, size, style }: {
  profile: Profile
  size: number
  style?: StyleProp<ViewStyle>
}) {
  const { clubs } = useAppData()
  if (profile.role === 'general_admin' || !profile.clubId) {
    return (
      <View style={[s.shield, { width: size, height: size, borderRadius: size / 2 }, style]}>
        <Ionicons name="shield-checkmark-outline" size={Math.round(size * 0.58)} color={colors.textPrimary} />
      </View>
    )
  }
  return (
    <ClubLogo
      clubId={profile.clubId}
      logoUpdatedAt={clubs?.find((c) => c.id === profile.clubId)?.logoUpdatedAt}
      // ClubLogo draws the first letter of `name`: the town's (« L » for
      // ASL Landser), not the abbreviation every ASL shares.
      name={clubInitial(profileClubName(profile))}
      size={size}
      style={style}
    />
  )
}

/**
 * A profile's photo with its club in the corner — the header's button, the
 * top of the account menu, a delegated profile's row. `managed` rings it in
 * the accent: the session is somebody else's. `badgeBorder` is the colour
 * the badge is cut out of — the navy bar in the header, white elsewhere.
 */
export function ProfileAvatar({ profile, avatarUpdatedAt, size, managed = false, badgeBorder = '#fff' }: {
  profile: Profile
  avatarUpdatedAt?: string
  size: number
  managed?: boolean
  badgeBorder?: string
}) {
  const badge = Math.max(16, Math.round(size * 0.5))
  return (
    <View style={{ width: size, height: size }}>
      <Avatar
        playerId={profile.id}
        avatarUpdatedAt={avatarUpdatedAt}
        firstName={profile.firstName}
        lastName={profile.lastName}
        size={size}
        style={managed ? s.managed : undefined}
      />
      <ProfileClubMark
        profile={profile}
        size={badge}
        style={[s.badge, { borderColor: badgeBorder }]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  shield: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: { position: 'absolute', right: -4, bottom: -4, borderWidth: 2 },
  managed: { borderWidth: 2, borderColor: colors.accent },
})
