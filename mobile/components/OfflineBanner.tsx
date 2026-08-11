import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// French day/time formatting without relying on Intl, e.g. "24/06 à 14:05".
function formatSyncedAt(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Thin bar shown at the top of the app when the displayed data comes from the
 * offline cache (issue #144). Auto-hides once a fresh fetch succeeds.
 */
export function OfflineBanner() {
  const { isAuthenticated } = useAuth()
  const { stale, lastSyncedAt } = useAppData()
  const insets = useSafeAreaInsets()

  if (!isAuthenticated || !stale) return null

  const synced = lastSyncedAt ? formatSyncedAt(lastSyncedAt) : null
  const label = synced ? `Hors ligne — données du ${synced}` : 'Mode hors ligne'

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <Ionicons name="cloud-offline-outline" size={15} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.accent,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.semiBold,
  },
})
