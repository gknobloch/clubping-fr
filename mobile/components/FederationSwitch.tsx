import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import type { Federation } from '@shared/types'

/**
 * « FFTT | AGR » above the phase switcher (#645), the web's `FederationSwitch`:
 * a club in two federations has two active phases, so the federation comes
 * first. Nothing when there is nothing to choose — a club of one federation
 * never sees it.
 */
export function FederationSwitch({
  options, value, onChange,
}: {
  options: ReadonlyArray<Pick<Federation, 'id' | 'shortName'>>
  value: string
  onChange: (federationId: string) => void
}) {
  if (options.length < 2) return null
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Fédération" testID="federation-switch">
      {options.map((f) => {
        const on = f.id === value
        return (
          <TouchableOpacity
            key={f.id}
            testID={`federation-${f.id}`}
            onPress={() => !on && onChange(f.id)}
            style={[styles.segment, on && styles.segmentOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={f.shortName}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{f.shortName}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignSelf: 'center', borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  segment: { minHeight: 44, minWidth: 72, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.accent },
  label: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textSecondary },
  labelOn: { color: '#fff' },
})
