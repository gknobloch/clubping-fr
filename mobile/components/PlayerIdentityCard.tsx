import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native'
import { colors } from '@/constants/colors'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import type { Club, PlayerStatus } from '@shared/types'
import { fonts } from '@/constants/typography'

const STATUS_LABELS: Record<PlayerStatus, string> = {
  active: 'Actif',
  archived: 'Archivé',
}

// Identity header card: avatar + name + club, with the club logo on the right.
// Shared by the Accueil welcome header and the player detail screen so they
// stay identical. Pass `style` for screen-specific margins.
export function PlayerIdentityCard({
  playerId,
  avatarUpdatedAt,
  firstName,
  lastName,
  name,
  club,
  status,
  style,
  onAvatarPress,
}: {
  playerId: string
  avatarUpdatedAt?: string
  firstName?: string
  lastName?: string
  name: string
  club?: Club
  /** When provided and not 'active', a status badge is shown under the club. */
  status?: PlayerStatus
  style?: StyleProp<ViewStyle>
  /** When set, the avatar becomes tappable (e.g. to open it enlarged). */
  onAvatarPress?: () => void
}) {
  const avatar = (
    <Avatar
      playerId={playerId}
      avatarUpdatedAt={avatarUpdatedAt}
      firstName={firstName}
      lastName={lastName}
      size={48}
    />
  )
  return (
    <View style={[s.card, style]}>
      {onAvatarPress ? (
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.8}>{avatar}</TouchableOpacity>
      ) : (
        avatar
      )}
      <View style={s.text}>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        {club ? <Text style={s.club} numberOfLines={1}>{club.displayName}</Text> : null}
        {status && status !== 'active' ? (
          <View style={s.statusBadge}>
            <Text style={s.statusText}>{STATUS_LABELS[status] ?? status}</Text>
          </View>
        ) : null}
      </View>
      {club ? (
        <ClubLogo
          clubId={club.id}
          logoUpdatedAt={club.logoUpdatedAt}
          name={club.displayName}
          size={48}
        />
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary },
  club: { fontSize: 16, fontFamily: fonts.regular, color: colors.textSecondary },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary },
})
