import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// Pick black or white text for legibility on top of an arbitrary team colour.
function readableTextOn(hex?: string): string {
  const c = hex ?? colors.accent
  const h = c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#fff'
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? colors.primary : '#fff'
}

// Round team-colour badge showing the team number, used where a player would
// have an avatar (team detail header, teams list) so teams and players line up
// the same way across screens.
export function TeamColorBadge({
  color,
  number,
  size = 48,
}: {
  color?: string
  number: number
  size?: number
}) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.accent },
      ]}
    >
      <Text style={[styles.num, { color: readableTextOn(color), fontSize: Math.round(size * 0.42) }]}>
        {number}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: fonts.extraBold },
})
