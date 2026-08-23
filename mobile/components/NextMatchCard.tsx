import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { AVAIL, ALL_STATUSES } from '@/constants/availability'
import { Avatar } from '@/components/Avatar'
import { MatchHeader } from '@/components/MatchHeader'
import type { AvailabilityStatus, Player } from '@shared/types'
import { fonts } from '@/constants/typography'

// The Accueil hero: the player's next match, with one-tap availability, a
// response summary, and (for captains) a shortcut to compose the line-up.
export function NextMatchCard({
  matchDayNumber,
  matchDayDate,
  time,
  confirmed,
  divisionLabel,
  teamColor,
  teamNumber,
  isHome,
  teamName,
  opponentName,
  venueLabel,
  myAvailability,
  canSetAvailability,
  onPickAvailability,
  onClearAvailability,
  availableCount,
  noResponseCount,
  availablePlayers,
  playersPerGame,
  selectedCount,
  isCaptain,
  onCompose,
  onOpenDetail,
  onAddToCalendar,
}: {
  matchDayNumber: number
  matchDayDate: string
  time?: string
  /** False while the receiving club's playing day is unknown (#429). */
  confirmed: boolean
  divisionLabel?: string
  teamColor?: string
  teamNumber: number
  isHome: boolean
  teamName: string
  opponentName: string
  venueLabel?: string
  myAvailability: AvailabilityStatus | undefined
  canSetAvailability: boolean
  onPickAvailability: (s: AvailabilityStatus) => void
  /** Re-tapping the active option clears the response. */
  onClearAvailability: () => void
  availableCount: number
  noResponseCount: number
  availablePlayers: Player[]
  playersPerGame: number
  selectedCount: number
  isCaptain: boolean
  onCompose: () => void
  /** Open the match detail screen. */
  onOpenDetail: () => void
  /** Hand the match to the phone's calendar (#426). */
  onAddToCalendar: () => void
}) {
  const stack = availablePlayers.slice(0, 3)
  const extra = Math.max(0, availableCount - stack.length)
  // Not enough confirmed players, or the line-up isn't filled yet.
  const enoughAvailable = availableCount >= playersPerGame
  const lineupComplete = selectedCount >= playersPerGame

  return (
    <View style={s.card}>
      {/* Tappable top → match detail */}
      <TouchableOpacity activeOpacity={0.7} onPress={onOpenDetail}>
        <MatchHeader
          matchDayNumber={matchDayNumber}
          divisionLabel={divisionLabel}
          teamColor={teamColor}
          teamNumber={teamNumber}
          isHome={isHome}
          teamName={teamName}
          opponentName={opponentName}
          matchDayDate={matchDayDate}
          time={time}
          confirmed={confirmed}
          venueLabel={venueLabel}
          showCountdown
          onAddToCalendar={onAddToCalendar}
        />
      </TouchableOpacity>

      {/* Availability */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Ma disponibilité</Text>
        <View style={s.segmented}>
          {ALL_STATUSES.map((status) => {
            const cfg = AVAIL[status]
            const active = myAvailability === status
            return (
              <TouchableOpacity
                key={status}
                disabled={!canSetAvailability}
                onPress={() => (active ? onClearAvailability() : onPickAvailability(status))}
                style={[
                  s.segment,
                  active
                    ? { backgroundColor: cfg.bg, borderColor: cfg.color }
                    : { borderColor: colors.border },
                  !canSetAvailability && s.segmentDisabled,
                ]}
              >
                <Text style={[s.segmentTxt, { color: active ? cfg.color : colors.textSecondary }]}>
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Team response summary — amber when fewer confirmed players than needed */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Disponibilité de l'équipe</Text>
        <View style={s.responses}>
          <View style={s.stack}>
            {stack.map((p, i) => (
              <View key={p.id} style={[s.stackItem, i > 0 && { marginLeft: -8 }]}>
                <Avatar
                  playerId={p.id}
                  avatarUpdatedAt={p.avatarUpdatedAt}
                  firstName={p.firstName}
                  lastName={p.lastName}
                  size={24}
                />
              </View>
            ))}
            {extra > 0 ? (
              <View style={[s.stackItem, stack.length > 0 && { marginLeft: -8 }]}>
                <View style={s.extra}><Text style={s.extraTxt}>+{extra}</Text></View>
              </View>
            ) : null}
          </View>
          {!enoughAvailable ? (
            <Ionicons name="alert-circle" size={14} color={colors.warning} />
          ) : null}
          <Text style={[s.responseTxt, !enoughAvailable && s.responseWarn]}>
            {availableCount} disponible{availableCount !== 1 ? 's' : ''} · {noResponseCount} sans réponse
          </Text>
        </View>
      </View>

      {/* Captain shortcut — shows the line-up fill state */}
      {isCaptain ? (
        <TouchableOpacity style={s.compose} onPress={onCompose}>
          <View style={s.composeLeft}>
            <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
            <Text style={s.composeTxt}>Composer l'équipe</Text>
          </View>
          <View style={s.composeRight}>
            <Text style={[s.composeCount, { color: lineupComplete ? colors.success : colors.warning }]}>
              {selectedCount}/{playersPerGame}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12,
  },
  section: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 },
  sectionLabel: { fontSize: 13, color: colors.textSecondary },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1, minHeight: 40, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  segmentDisabled: { opacity: 0.5 },
  segmentTxt: { fontSize: 14, fontFamily: fonts.semiBold },
  responses: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stack: { flexDirection: 'row', marginRight: 4 },
  stackItem: { borderRadius: 12, borderWidth: 1.5, borderColor: colors.card },
  extra: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  extraTxt: { fontSize: 10, fontFamily: fonts.bold, color: colors.textSecondary },
  responseTxt: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  responseWarn: { color: colors.warning, fontFamily: fonts.semiBold },
  compose: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12,
  },
  composeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composeTxt: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  composeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  composeCount: { fontSize: 14, fontFamily: fonts.bold },
})
