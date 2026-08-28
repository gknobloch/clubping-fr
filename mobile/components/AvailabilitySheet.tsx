import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Sheet } from '@/components/Sheet'
import { colors } from '@/constants/colors'
import { AVAIL, ALL_STATUSES } from '@/constants/availability'
import { fonts } from '@/constants/typography'
import type { AvailabilityStatus } from '@shared/types'

// ---------------------------------------------------------------------------
// Answering from a grid cell (#468)
//
// The roster rows elsewhere put the three OUI/PE/NON pills side by side
// (`PlayerRow`), which needs 142pt. A journée column is 96, so the matrix shows
// one control per cell and asks here instead — through `Sheet`, so it is a
// bottom sheet on a phone and a centred dialog on a slab (#446).
// ---------------------------------------------------------------------------
export function AvailabilitySheet({
  title,
  subtitle,
  value,
  onPick,
  onClear,
  onClose,
}: {
  /** Who is being answered for. */
  title: string
  /** Which fixture — «J5 · sam. 17 janv.». */
  subtitle?: string
  value?: AvailabilityStatus
  onPick: (status: AvailabilityStatus) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose} testID="availability-sheet" maxHeight="60%">
      <View style={s.body}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

        {ALL_STATUSES.map((status) => {
          const cfg = AVAIL[status]
          const active = value === status
          return (
            <TouchableOpacity
              key={status}
              style={[
                s.option,
                active ? { borderColor: cfg.color, backgroundColor: cfg.bg } : null,
              ]}
              onPress={() => onPick(status)}
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : {}}
            >
              <View style={[s.dot, { backgroundColor: cfg.color }]} />
              <Text style={[s.optionText, active && { color: cfg.color }]}>{cfg.label}</Text>
            </TouchableOpacity>
          )
        })}

        {/* Only when there is something to clear — the app's rule everywhere
            else is that re-tapping the active pill removes the answer. */}
        {value && (
          <TouchableOpacity style={s.clear} onPress={onClear} accessibilityRole="button">
            <Text style={s.clearText}>Effacer la réponse</Text>
          </TouchableOpacity>
        )}
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  body: { padding: 20, gap: 10 },
  title: { fontSize: 17, fontFamily: fonts.semiBold, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: -6, marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  dot: { width: 10, height: 10, borderRadius: 5 },
  clear: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  clearText: { fontSize: 14, color: colors.danger, fontFamily: fonts.semiBold },
})
