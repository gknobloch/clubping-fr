import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// Stacked < title > switcher used to page through phases / match-days.
// Shared by the Journées and Équipes screens.
export function Switcher({
  title, subtitle, onPrev, onNext, large,
}: {
  title: string; subtitle?: string; onPrev?: () => void; onNext?: () => void; large?: boolean
}) {
  return (
    <View style={[sw.row, large && sw.rowLarge]}>
      <TouchableOpacity onPress={onPrev} disabled={!onPrev} style={sw.btn} hitSlop={8}>
        <Ionicons name="chevron-back" size={large ? 22 : 18} color={onPrev ? colors.textSecondary : colors.border} />
      </TouchableOpacity>
      <View style={sw.center}>
        <Text style={large ? sw.titleLarge : sw.title}>{title}</Text>
        {subtitle ? <Text style={sw.subtitle}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity onPress={onNext} disabled={!onNext} style={sw.btn} hitSlop={8}>
        <Ionicons name="chevron-forward" size={large ? 22 : 18} color={onNext ? colors.textSecondary : colors.border} />
      </TouchableOpacity>
    </View>
  )
}

const sw = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  rowLarge: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 6, paddingVertical: 8,
  },
  btn: { padding: 6 },
  center: { alignItems: 'center', flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  titleLarge: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
})
