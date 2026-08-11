import { Image, View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useEffect, useState } from 'react'
import { avatarImageSource } from '@/utils/avatarSource'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// Round player avatar. Loads the image from GET /api/users/:id/avatar
// (auth header + a cache-busting ?v=avatarUpdatedAt) when the player has one,
// otherwise falls back to their initials.
export function Avatar({
  playerId,
  avatarUpdatedAt,
  firstName,
  lastName,
  size = 40,
  style,
}: {
  playerId: string
  avatarUpdatedAt?: string
  firstName?: string
  lastName?: string
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  const [failed, setFailed] = useState(false)
  // Retry the image if a new version arrives after a previous load failed.
  useEffect(() => setFailed(false), [avatarUpdatedAt])

  const showImage = !!avatarUpdatedAt && !failed
  const initials =
    `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
  const dim = { width: size, height: size, borderRadius: size / 2 }

  return (
    <View style={[styles.base, dim, style]}>
      {showImage ? (
        <Image
          source={avatarImageSource(playerId, avatarUpdatedAt!)}
          style={dim}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.4) }]}>{initials}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { color: colors.textSecondary, fontFamily: fonts.bold },
})
