import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants/colors'
import { CONTENT_MAX_WIDTH } from '@/constants/layout'

// ---------------------------------------------------------------------------
// The frame every screen sits in (#446)
//
// Two jobs, deliberately split, because they act at different depths:
//
//   `Screen` is the screen's outer view. It fills the space the navigator
//   leaves and carries the *horizontal* safe-area insets. #445 unlocked
//   rotation and moved the two pieces of chrome pinned to the edges — the
//   header and the tab bar — off the notch, but left the screens themselves,
//   precisely because doing it properly meant this component. Until now, on a
//   notched phone held sideways, a screen's content ran under the notch.
//
//   `contentWidth()` goes on the `contentContainerStyle` of that screen's root
//   scroller: it caps the content at a reading width and centres it. That one
//   line is most of what makes a tablet legible, which is why it is a style to
//   spread rather than a wrapper to nest.
// ---------------------------------------------------------------------------

/** A screen's root view: the app background, clear of a landscape notch. */
export function Screen({
  children,
  style,
  pane = false,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /**
   * This one is a pane inside a `Screen`, not a screen (#447): a two-pane
   * section frames itself once, and the fiche in its right-hand pane must not
   * take the window's insets a second time — the left one, in particular,
   * belongs to the list beside it and not to the fiche.
   */
  pane?: boolean
}) {
  const insets = useSafeAreaInsets()

  return (
    <View
      testID={pane ? 'pane' : 'screen'}
      style={[
        s.screen,
        !pane && { paddingLeft: insets.left, paddingRight: insets.right },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/**
 * `contentContainerStyle` for a screen's root `ScrollView` / `FlatList`: one
 * reading width, centred. `columns` widens it for a grid — one reading width
 * per column, so a two-column list is two readable columns rather than one
 * stretched row cut in half.
 */
export function contentWidth(columns: 1 | 2 = 1): ViewStyle {
  return columns === 2 ? s.contentTwo : s.contentOne
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // `width: '100%'` alongside the cap: `alignSelf` alone would shrink the
  // container to its content on a phone, where there is nothing to cap.
  contentOne: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  contentTwo: { width: '100%', maxWidth: CONTENT_MAX_WIDTH * 2, alignSelf: 'center' },
})
