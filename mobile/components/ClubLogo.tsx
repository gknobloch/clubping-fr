import { Image, View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useEffect, useState } from 'react'
import { apiUrl } from '@/constants/api'
import { getSessionToken } from '@/utils/api'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// Square club logo. Loads the image from GET /api/clubs/:id/logo (with a
// cache-busting ?v=logoUpdatedAt) when the club has one, otherwise falls back
// to the club's initial on a neutral tile. Mirrors Avatar, but logos are not
// round and are contained (not cropped).
export function ClubLogo({
  clubId,
  logoUpdatedAt,
  name,
  size = 40,
  style,
}: {
  clubId: string
  logoUpdatedAt?: string
  name?: string
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  const [failed, setFailed] = useState(false)
  // Retry the image if a new version arrives after a previous load failed.
  useEffect(() => setFailed(false), [logoUpdatedAt])

  const token = getSessionToken()
  const showImage = !!logoUpdatedAt && !failed
  const initial = (name?.[0] ?? '?').toUpperCase()
  // Round to match the player Avatar; the logo is contained (not cropped), so
  // the circular clip only trims the empty corners of its bounding box.
  const dim = { width: size, height: size, borderRadius: size / 2 }

  return (
    <View style={[styles.base, dim, style]}>
      {showImage ? (
        <Image
          source={{
            uri: `${apiUrl(`/clubs/${clubId}/logo`)}?v=${encodeURIComponent(logoUpdatedAt!)}`,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }}
          style={dim}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { color: colors.textSecondary, fontFamily: fonts.bold },
})
