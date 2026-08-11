import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// Neutral pill with a team-coloured dot, used wherever a team is tagged
// (match header, player quick view) so they all look identical.
// `large` bumps the size; `danger` switches the border + text to red
// (used for the brûlage tag).
export function TeamBadge({
  color,
  label,
  large,
  danger,
}: {
  color?: string
  label: string
  large?: boolean
  danger?: boolean
}) {
  return (
    <View style={[tb.badge, large && tb.badgeLarge, danger && tb.badgeDanger]}>
      <View style={[tb.dot, large && tb.dotLarge, { backgroundColor: color ?? colors.accent }]} />
      <Text style={[tb.txt, large && tb.txtLarge, danger && tb.txtDanger]}>{label}</Text>
    </View>
  )
}

const tb = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  badgeLarge: { gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeDanger: { borderColor: colors.danger },
  dot: { width: 8, height: 8, borderRadius: 2 },
  dotLarge: { width: 10, height: 10, borderRadius: 3 },
  txt: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary },
  txtLarge: { fontSize: 13 },
  txtDanger: { color: colors.danger },
})
