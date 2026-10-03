import { useContext, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View, type DimensionValue } from 'react-native'
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants/colors'
import { useLayout } from '@/constants/layout'

// ---------------------------------------------------------------------------
// The app's one modal container (#446)
//
// Three screens carried the same twenty lines: a `justifyContent: 'flex-end'`
// backdrop and a full-width panel rounded at the top. On a phone that is a
// bottom sheet. On a tablet it is a 1024pt-wide, 200pt-tall band across the
// bottom edge of the slab, with its title at one end and nothing at the other.
//
// Above the tablet threshold this becomes what it should always have been up
// there: a dialog, centred, capped, rounded on all four corners. One component
// so the three are settled at once — the consolidation the web did with
// `ModalShell` (see CLAUDE.md, *Mobile UI*).
// ---------------------------------------------------------------------------

/** Dialog width above the threshold. Wide enough for a roster row, no wider. */
export const DIALOG_MAX_WIDTH = 520

/** A `wide` dialog: a grid of seven journées beside a name (#623). */
export const WIDE_DIALOG_MAX_WIDTH = 960

const PADDING = 24
const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
const DENSE_PADDING = 12
/** The backdrop's own padding around a centred dialog. */
const BACKDROP_PADDING = 24

/**
 * The width a sheet leaves its content — so a grid inside one can size its
 * columns to it rather than to the window. Mirrors the styles below.
 */
export function sheetContentWidth({
  width,
  isTablet,
  wide = false,
  dense = false,
  insets,
}: {
  width: number
  isTablet: boolean
  wide?: boolean
  dense?: boolean
  insets: Pick<EdgeInsets, 'left' | 'right'>
}): number {
  if (isTablet) {
    const max = wide ? WIDE_DIALOG_MAX_WIDTH : DIALOG_MAX_WIDTH
    return Math.min(max, width - BACKDROP_PADDING * 2) - PADDING * 2
  }
  if (dense) {
    return width - Math.max(insets.left, DENSE_PADDING) - Math.max(insets.right, DENSE_PADDING)
  }
  return width - PADDING * 2
}

export function Sheet({
  onClose,
  /** Share of the window the panel may grow to. */
  maxHeight = '85%',
  testID = 'sheet',
  wide = false,
  dense = false,
  rotates = false,
  children,
}: {
  onClose: () => void
  maxHeight?: DimensionValue
  testID?: string
  /** On a tablet, a dialog for a grid rather than for a roster row. */
  wide?: boolean
  /**
   * A phone on its side, where every point of ~400 counts (#623): a third of
   * the padding, the home indicator and the notch as the only margins.
   */
  dense?: boolean
  /**
   * The sheet turns with the phone. iOS presents a `Modal` portrait-only
   * unless told otherwise — so a sheet opened from a phone on its side
   * rotated the screen upright under the member's hands.
   */
  rotates?: boolean
  children: ReactNode
}) {
  const { isTablet } = useLayout()
  // The context and not `useSafeAreaInsets`, which throws without a provider:
  // the insets only matter to a dense sheet, and every other sheet in the app
  // rendered without them before (#623).
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS
  const denseOnPhone = dense && !isTablet

  return (
    // A dialog that slides up from the bottom edge to settle in the middle
    // reads as a sheet that stopped halfway; it fades in instead.
    <Modal
      transparent
      animationType={isTablet ? 'fade' : 'slide'}
      onRequestClose={onClose}
      supportedOrientations={rotates ? ['portrait', 'landscape-left', 'landscape-right'] : undefined}
    >
      <Pressable
        testID={`${testID}-backdrop`}
        style={[s.backdrop, isTablet && s.backdropCentred]}
        onPress={onClose}
      >
        {/* View + onStartShouldSetResponder stops the backdrop from closing when
            tapping the panel, without competing with nested TouchableOpacity rows */}
        <View
          testID={testID}
          style={[
            s.sheet,
            { maxHeight },
            denseOnPhone && {
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, DENSE_PADDING),
              paddingLeft: Math.max(insets.left, DENSE_PADDING),
              paddingRight: Math.max(insets.right, DENSE_PADDING),
            },
            isTablet && s.dialog,
            isTablet && wide && s.dialogWide,
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* The grab handle is a phone affordance: it says "this came up from
              the bottom edge and goes back down". A centred dialog has no such
              story, so it does not wear the badge for one. */}
          {!isTablet && (
            <View testID={`${testID}-handle`} style={[s.handle, denseOnPhone && s.handleDense]} />
          )}
          {children}
        </View>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdropCentred: { justifyContent: 'center', alignItems: 'center', padding: BACKDROP_PADDING },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: PADDING,
    // Clears the home indicator, which the sheet sits right on top of.
    paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12,
  },
  handleDense: { marginBottom: 8 },
  dialog: {
    width: '100%',
    maxWidth: DIALOG_MAX_WIDTH,
    borderRadius: 20,
    paddingBottom: PADDING,
  },
  dialogWide: { maxWidth: WIDE_DIALOG_MAX_WIDTH },
})
