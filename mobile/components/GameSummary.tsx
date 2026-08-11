import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// Shared presentational summary for a single game/match: an optional round
// label (e.g. "Équipe 5"), the matchup title with a home/away indicator, the
// date + time (with a clock icon), and the journée / division badges. Used by
// both the Accueil match cards and the Journées week-detail cards so the two
// stay visually in sync.
export function GameSummary({
  title,
  teamLabel,
  isHome,
  dateLabel,
  time,
  matchDayNumber,
  divisionLabel,
  style,
}: {
  title: string
  /** Optional round label shown above the matchup, e.g. "Équipe 5". */
  teamLabel?: string
  /** When set, shows a home (Domicile) / away (Extérieur) indicator. */
  isHome?: boolean
  dateLabel?: string
  time?: string
  matchDayNumber?: number
  divisionLabel?: string
  style?: StyleProp<ViewStyle>
}) {
  const hasBadges = matchDayNumber != null || !!divisionLabel
  return (
    <View style={[s.info, style]}>
      {teamLabel ? <Text style={s.teamLabel}>{teamLabel}</Text> : null}
      <View style={s.titleRow}>
        {isHome != null ? (
          <Ionicons
            name={isHome ? 'home' : 'paper-plane-outline'}
            size={14}
            color={colors.textSecondary}
            style={s.homeIcon}
          />
        ) : null}
        <Text style={s.title}>{title}</Text>
      </View>
      {(dateLabel || time) && (
        <View style={s.metaRow}>
          {dateLabel ? <Text style={s.meta}>{dateLabel}</Text> : null}
          {time ? (
            <View style={s.timeRow}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={s.meta}>{time}</Text>
            </View>
          ) : null}
        </View>
      )}
      {hasBadges && (
        <View style={s.badges}>
          {matchDayNumber != null ? <Text style={s.badge}>J{matchDayNumber}</Text> : null}
          {divisionLabel ? <Text style={s.badge}>{divisionLabel}</Text> : null}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  info: { gap: 4 },
  teamLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  homeIcon: { marginTop: 2 },
  title: { flex: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  meta: { fontSize: 13, color: colors.textSecondary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badges: { flexDirection: 'row', gap: 4, marginTop: 4 },
  badge: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
})
