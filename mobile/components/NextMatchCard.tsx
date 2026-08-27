import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { AVAIL, ALL_STATUSES } from '@/constants/availability'
import { Avatar } from '@/components/Avatar'
import { MatchHeader } from '@/components/MatchHeader'
import { PlayerRow } from '@/components/PlayerRow'
import type { AvailabilityStatus, Player } from '@shared/types'
import { fonts } from '@/constants/typography'

/**
 * Below this the card is one column and shows the response summary; at or above
 * it the card splits in half and shows the roster itself (#459).
 *
 * It is the *card's* width, not the window's: an iPad in Split View is handed a
 * phone's width and must stack, while the same iPad at two thirds of the screen
 * has room for both halves. 640 leaves each half 320pt — a name and the three
 * pills (142pt) without either being cramped.
 */
export const CARD_SPLIT_MIN_WIDTH = 640

/**
 * What the team answered, for the roster the wide card shows beside the game.
 * Absent below the threshold, where the card keeps its summary line.
 */
export interface TeamAnswers {
  roster: Player[]
  /** The signed-in player, drawn as themselves in the list. */
  mePlayerId?: string
  availabilityOf: (playerId: string) => AvailabilityStatus | undefined
  selectedIds: string[]
  /**
   * Per player, not per viewer: everybody may answer for themselves, a captain
   * and a club's administrator for the team, and a general administrator for
   * nobody (#462).
   */
  canEdit: (playerId: string) => boolean
  onSet: (playerId: string, status: AvailabilityStatus) => void
  /** Back to "sans réponse" — re-tapping the pill that is already on. */
  onClear: (playerId: string) => void
  onOpenPlayer: (playerId: string) => void
}

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
  wide = false,
  team,
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
  /** Split in two: the game and my answer on one side, the team's on the other. */
  wide?: boolean
  /** Required when `wide` — it is the whole right-hand half. */
  team?: TeamAnswers
}) {
  const stack = availablePlayers.slice(0, 3)
  const extra = Math.max(0, availableCount - stack.length)
  // Not enough confirmed players, or the line-up isn't filled yet.
  const enoughAvailable = availableCount >= playersPerGame
  const lineupComplete = selectedCount >= playersPerGame

  const splitRoster = wide && !!team

  // The game and what it asks of me. Whole card below the threshold, left half
  // above it — the same elements either way, so nothing is styled twice.
  const gameSide = (
    <>
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
    </>
  )

  // The summary the narrow card carries in place of the roster: three avatars
  // and a count. It says the same thing the list says, in one line.
  const summary = (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Disponibilité de l&apos;équipe</Text>
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
  )

  // One line per player, with the answer they gave. `PlayerRow` is the row the
  // match screen and Mes matchs already use, pills and all: a captain sets an
  // answer with one tap and clears it by tapping the pill that is already on
  // — no menu to open, and nothing new to learn here (#459).
  const roster = team ? (
    <View style={s.rosterSection}>
      <View style={s.rosterHead}>
        <Text style={s.sectionLabel}>Disponibilité de l&apos;équipe</Text>
        {noResponseCount > 0 ? (
          <Text style={s.rosterPending}>{noResponseCount} sans réponse</Text>
        ) : null}
      </View>
      <View>
        {team.roster.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            availability={team.availabilityOf(p.id)}
            selected={team.selectedIds.includes(p.id)}
            isMe={p.id === team.mePlayerId}
            canEdit={team.canEdit(p.id)}
            gameDatePast={false}
            onPickAvailability={(status) => team.onSet(p.id, status)}
            onClear={() => team.onClear(p.id)}
            onPressName={() => team.onOpenPlayer(p.id)}
          />
        ))}
      </View>
    </View>
  ) : null

  const compose = isCaptain ? (
    <TouchableOpacity style={s.compose} onPress={onCompose}>
      <View style={s.composeLeft}>
        <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
        <Text style={s.composeTxt}>Composer l&apos;équipe</Text>
      </View>
      <View style={s.composeRight}>
        <Text style={[s.composeCount, { color: lineupComplete ? colors.success : colors.warning }]}>
          {selectedCount}/{playersPerGame}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  ) : null

  if (!splitRoster) {
    return (
      <View style={s.card}>
        {gameSide}
        {summary}
        {compose}
      </View>
    )
  }

  // Halves of equal width, divided by the rule the sections use between them.
  // "Composer l'équipe" sits at the foot of the roster, beside the names it
  // acts on, and `marginTop: auto` keeps it there however long the list runs.
  return (
    <View style={[s.card, s.cardSplit]} testID="match-card-split">
      <View style={s.half}>{gameSide}</View>
      <View style={[s.half, s.halfRight]}>
        {roster}
        {compose}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12,
  },
  cardSplit: { flexDirection: 'row', gap: 14 },
  half: { flex: 1, minWidth: 0, gap: 12 },
  halfRight: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 14 },

  section: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 },
  // No rule above it: the vertical divider between the halves is the one that
  // separates it from the game already.
  rosterSection: { gap: 8 },
  rosterHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rosterPending: {
    marginLeft: 'auto', fontSize: 12,
    fontFamily: fonts.semiBold, color: colors.warning,
  },
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
    marginTop: 'auto',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12,
  },
  composeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composeTxt: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  composeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  composeCount: { fontSize: 14, fontFamily: fonts.bold },
})
