import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { AVAIL, ALL_STATUSES } from '@/constants/availability'
import type { AvailabilityStatus, Player } from '@shared/types'
import { fonts } from '@/constants/typography'

// A roster row: an optional "selected for the line-up" check, the player's
// name, and the OUI/PE/NON availability pills (re-tapping the active one
// clears the response). Shared by the Mes matchs game cards and the match
// detail screen.
export function PlayerRow({
  player,
  availability,
  selected,
  isMe,
  canEdit,
  gameDatePast,
  borrowed,
  lockedReason,
  onPickAvailability,
  onClear,
  onPressName,
}: {
  player: Player
  availability: AvailabilityStatus | undefined
  selected: boolean
  isMe: boolean
  canEdit: boolean
  gameDatePast: boolean
  /** Player selected from another team — shown without availability pills. */
  borrowed?: boolean
  /** Non-selectable (e.g. already fielded elsewhere) — shows the reason in
   *  place of the pills, greyed, in the same slot as the "Renfort" tag. */
  lockedReason?: string
  onPickAvailability: (s: AvailabilityStatus) => void
  /** Re-tapping the active pill clears the response. */
  onClear: () => void
  onPressName: () => void
}) {
  const slotLabel = lockedReason ?? (borrowed ? 'Renfort' : null)
  return (
    <View style={pr.row}>
      {selected ? (
        <View style={pr.checkBadge}><Text style={pr.checkTxt}>✓</Text></View>
      ) : (
        <View style={pr.checkPlaceholder} />
      )}

      <TouchableOpacity style={pr.nameBtn} onPress={onPressName}>
        <Text style={[pr.name, isMe && pr.nameMe, lockedReason ? pr.nameLocked : null]} numberOfLines={1}>
          {player.firstName} {player.lastName}
        </Text>
      </TouchableOpacity>

      {slotLabel !== null ? (
        <View style={pr.slot}>
          <Text style={pr.slotTag}>{slotLabel}</Text>
        </View>
      ) : (
        <View style={pr.pills}>
          {ALL_STATUSES.map((status) => {
            const cfg = AVAIL[status]
            const active = availability === status
            const editable = canEdit && !gameDatePast
            return (
              <TouchableOpacity
                key={status}
                disabled={!editable}
                onPress={() => (active ? onClear() : onPickAvailability(status))}
                style={[
                  pr.pill,
                  active
                    ? { backgroundColor: cfg.bg, borderColor: cfg.color }
                    : { borderColor: colors.border },
                  !editable && pr.pillDisabled,
                ]}
              >
                <Text style={[pr.pillTxt, { color: active ? cfg.color : colors.textSecondary }]}>
                  {cfg.short}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  )
}

const pr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  checkBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  checkPlaceholder: { width: 18 },
  checkTxt: { color: '#fff', fontSize: 10, fontFamily: fonts.bold },
  nameBtn: { flex: 1 },
  name: { fontSize: 14, color: colors.textPrimary },
  nameMe: { fontFamily: fonts.bold, color: colors.accent },
  nameLocked: { color: colors.textSecondary },
  pills: { flexDirection: 'row', gap: 5 },
  pill: {
    width: 44, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  pillDisabled: { opacity: 0.5 },
  pillTxt: { fontSize: 11, fontFamily: fonts.bold },
  // Occupies the same footprint as the 3 pills (3 × 44 + 2 × 5 gap = 142 wide)
  // with matching vertical padding + border so "Renfort" / "Joue en …" rows
  // keep the same height as roster rows, and the label stays centered.
  slot: {
    width: 142,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTag: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
})
