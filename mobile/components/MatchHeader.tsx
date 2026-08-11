import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { TeamBadge } from '@/components/TeamBadge'
import { todayIso } from '@/utils/weeks'
import { fonts } from '@/constants/typography'

// Days-until label from a YYYY-MM-DD match date.
function countdownLabel(dateStr: string): string {
  const today = new Date(todayIso() + 'T00:00:00')
  const d = new Date(dateStr + 'T00:00:00')
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  return `Dans ${days} jours`
}

// Shared match header — badges (J#, division, team), optional countdown,
// home/away matchup, date·time, and venue. Used by the Accueil next-match
// card and the match detail screen so they stay identical.
export function MatchHeader({
  matchDayNumber,
  divisionLabel,
  teamColor,
  teamNumber,
  isHome,
  teamName,
  opponentName,
  matchDayDate,
  time,
  venueLabel,
  showCountdown,
  label,
  labelMine,
}: {
  matchDayNumber: number
  divisionLabel?: string
  teamColor?: string
  teamNumber: number
  isHome: boolean
  teamName: string
  opponentName: string
  matchDayDate: string
  time?: string
  venueLabel?: string
  showCountdown?: boolean
  /** Optional badge shown right of the team (e.g. "Mon équipe" / "Renfort"). */
  label?: string
  labelMine?: boolean
}) {
  const dateLabel = new Date(matchDayDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const title = isHome ? `${teamName} – ${opponentName}` : `${opponentName} – ${teamName}`

  return (
    <View style={s.wrap}>
      <View style={s.badgeRow}>
        <View style={s.badges}>
          <Text style={s.badge}>J{matchDayNumber}</Text>
          {divisionLabel ? <Text style={s.badge}>{divisionLabel}</Text> : null}
          <TeamBadge color={teamColor} label={`Équipe ${teamNumber}`} />
          {label ? (
            <View style={[s.label, labelMine && s.labelMine]}>
              <Text style={[s.labelTxt, labelMine && s.labelTxtMine]}>{label}</Text>
            </View>
          ) : null}
        </View>
        {showCountdown ? (
          <View style={s.countdown}>
            <Ionicons name="time-outline" size={12} color={colors.warning} />
            <Text style={s.countdownTxt}>{countdownLabel(matchDayDate)}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.titleRow}>
        <Ionicons
          name={isHome ? 'home' : 'paper-plane-outline'}
          size={15}
          color={colors.textSecondary}
          style={{ marginTop: 3 }}
        />
        <Text style={s.title}>{title}</Text>
      </View>

      <View style={s.metaRow}>
        <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
        <Text style={s.meta}>{dateLabel}{time ? ` · ${time}` : ''}</Text>
      </View>
      {venueLabel ? (
        <View style={s.metaRow}>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text style={s.meta}>{venueLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  badge: {
    fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden',
  },
  label: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  labelMine: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  labelTxt: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary },
  labelTxtMine: { color: colors.accent },
  countdown: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  countdownTxt: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.warning },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flex: 1, fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
})
