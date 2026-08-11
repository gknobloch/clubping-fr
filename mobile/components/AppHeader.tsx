import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { displayFonts } from '@/constants/typography'
import { AccountHeaderButton } from '@/components/AccountHeaderButton'
import { BrandMark } from '@/components/BrandMark'

// ---------------------------------------------------------------------------
// The app's one header (#365)
//
// Every navigator renders this, through the `header` option. Before, each of
// them styled its own: the tab-level screens got the bottom-tabs header, the
// section stacks the native-stack one, and the two centre their content
// differently — the title and the avatar sat a few points apart depending on
// which tab you were on, and the avatar hung low in the bar.
//
// One component means one height, one title position and one avatar position,
// by construction rather than by five files agreeing.
// ---------------------------------------------------------------------------

/** Bar height, above the status-bar inset. */
export const HEADER_HEIGHT = 52

// Both sides reserve the same width so the title is centred in the bar itself,
// not in whatever space the back button and the avatar happen to leave.
const SIDE_WIDTH = 44

export function AppHeader({
  title,
  showBack = false,
  showAccount = true,
}: {
  title: string
  /** Back chevron on the left — the pushed detail screens. */
  showBack?: boolean
  /** Off on the account screen itself, which is where the avatar leads. */
  showAccount?: boolean
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={[styles.header, { paddingTop: insets.top, height: HEADER_HEIGHT + insets.top }]}>
      <View style={styles.side}>
        {/* router.back() rather than the native stack's own back: the first
            detail screen pushed onto the shared stack has nothing beneath it
            there, but plenty in the navigation history (#153). */}
        {showBack && router.canGoBack() ? (
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        ) : (
          // The slot is reserved for the chevron anyway, so the mark costs no
          // layout — and it puts the brand on every screen rather than on the
          // login page alone (#366). White: the bar is always dark navy.
          <BrandMark size={30} color="#fff" ballColor={colors.primary} />
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.sideRight]}>{showAccount && <AccountHeaderButton />}</View>
    </View>
  )
}

/**
 * `header` for a navigator's screenOptions. The parameter is deliberately
 * structural: bottom-tabs and native-stack pass their own props type, and both
 * carry the two fields read here.
 */
export const appHeader = ({
  options,
  route,
}: {
  options: { title?: string }
  route: { name: string }
}) => <AppHeader title={options.title ?? route.name} />

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
  },
  side: { width: SIDE_WIDTH, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontFamily: displayFonts.semiBold,
  },
})
