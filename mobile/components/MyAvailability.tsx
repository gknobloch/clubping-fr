import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { AVAIL, ALL_STATUSES } from '@/constants/availability'
import type { AvailabilityStatus } from '@shared/types'

// ---------------------------------------------------------------------------
// « Ma disponibilité » — the member's own Oui / Peut-être / Non
//
// One control for every place a member answers for themselves: the Accueil's
// match card, and a guided training session (#608). The training card first
// carried a copy of the match card's, and the copy had already drifted (44pt
// and a 1pt border against 40pt and 1.5pt) — side by side on the Accueil, the
// same question in two sizes. So it is one component, geometry and all.
//
// Tapping the answer already given withdraws it.
// ---------------------------------------------------------------------------

export function MyAvailability({
  status,
  onPick,
  onClear,
  disabled = false,
  testIDPrefix,
}: {
  status: AvailabilityStatus | undefined
  onPick: (status: AvailabilityStatus) => void
  onClear: () => void
  disabled?: boolean
  /** Each button gets `${testIDPrefix}-${status}`. */
  testIDPrefix?: string
}) {
  return (
    <View style={s.section}>
      <Text style={s.label}>Ma disponibilité</Text>
      <View style={s.segmented}>
        {ALL_STATUSES.map((option) => {
          const cfg = AVAIL[option]
          const active = status === option
          return (
            <TouchableOpacity
              key={option}
              testID={testIDPrefix ? `${testIDPrefix}-${option}` : undefined}
              disabled={disabled}
              onPress={() => (active ? onClear() : onPick(option))}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={cfg.label}
              style={[
                s.segment,
                active ? { backgroundColor: cfg.bg, borderColor: cfg.color } : { borderColor: colors.border },
                disabled && s.segmentDisabled,
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
  )
}

// The match card's geometry, moved here unchanged.
const s = StyleSheet.create({
  section: { gap: 8 },
  label: { fontSize: 13, color: colors.textSecondary },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1, minHeight: 40, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  segmentDisabled: { opacity: 0.5 },
  segmentTxt: { fontSize: 14, fontFamily: fonts.semiBold },
})
