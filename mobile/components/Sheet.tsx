import { useContext, useEffect, useState, type ReactNode } from 'react'
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
  type ModalProps,
} from 'react-native'
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants/colors'
import { CONTENT_MAX_WIDTH, useLayout } from '@/constants/layout'

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
//
// A phone on its side (#625) is still a phone, so still a sheet — but one
// ~400pt tall with a notch at each end. The sheet keeps off the notch, stops at
// a reading column's width, and takes the height bar a sliver: the caller's
// `maxHeight` is a share of a phone standing up, and 60% of 402pt is a panel
// too short for three buttons.
//
// The keyboard is the sheet's business too (#628). Each sheet with a field
// used to decide for itself, and four of six did nothing: on a phone on its
// side the keyboard takes ~200 of 402pt, and a channel's link field was typed
// blind under it. The panel now rises above the keyboard, capped to what is
// left, and what no longer fits scrolls — the same rule as sideways.
// ---------------------------------------------------------------------------

/**
 * Every orientation the app has (app.json `orientation: default`). iOS
 * presents a `Modal` portrait-only on an iPhone unless told otherwise, so a
 * sheet opened from a phone on its side turned the screen upright under the
 * member's hands (#625). Upside-down is listed for the iPad, which allows every
 * orientation by default and would lose that one to a shorter list; the
 * Info.plist still keeps it off an iPhone.
 *
 * Every `Modal` in the app passes this — `__tests__/modal-orientations.test.ts`
 * reads the sources.
 */
export const MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = [
  'portrait',
  'portrait-upside-down',
  'landscape-left',
  'landscape-right',
]

/** Dialog width above the threshold. Wide enough for a roster row, no wider. */
export const DIALOG_MAX_WIDTH = 520

/** A `wide` dialog: a grid of seven journées beside a name (#623). */
export const WIDE_DIALOG_MAX_WIDTH = 960

/**
 * A phone sheet stops at a reading column, as screens do: a phone on its side
 * is 874pt wide, and a row stretched across it is a name at one end and its
 * checkbox at the other. Standing up, no phone reaches it.
 */
export const SHEET_MAX_WIDTH = CONTENT_MAX_WIDTH

/**
 * The backdrop left above a sheet on a phone on its side — what still says
 * «sheet», and what a tap closes it on. Every other point is the panel's.
 */
export const SIDEWAYS_GAP = 12

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
  return Math.min(SHEET_MAX_WIDTH, width - insets.left - insets.right) - PADDING * 2
}

/**
 * How much of the window the keyboard covers, from the bottom edge up.
 *
 * iOS only: on Android a `Modal` is a dialog window React Native opens with
 * `SOFT_INPUT_ADJUST_RESIZE`, so the window itself already shrinks above the
 * keyboard — lifting the panel as well would lift it twice. Measured from the
 * keyboard's top edge rather than its height, so an iPad's floating or
 * undocked keyboard, which covers no bottom edge, lifts nothing.
 */
export function useKeyboardOverlap(): number {
  const { height } = useWindowDimensions()
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    // `WillChangeFrame` and not `WillShow`: it also fires when the keyboard
    // changes height (suggestions bar, emoji) and when it turns with the phone.
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => setKeyboardTop(e.endCoordinates.screenY))
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardTop(null))
    return () => {
      change.remove()
      hide.remove()
    }
  }, [])

  return keyboardTop === null ? 0 : Math.max(0, height - keyboardTop)
}

export function Sheet({
  onClose,
  /**
   * Share of the window the panel may grow to, standing up. On a phone on its
   * side the panel takes the height bar `SIDEWAYS_GAP` whatever this says.
   */
  maxHeight = '85%',
  testID = 'sheet',
  wide = false,
  dense = false,
  children,
}: {
  onClose: () => void
  maxHeight?: DimensionValue
  testID?: string
  /** On a tablet, a dialog for a grid rather than for a roster row. */
  wide?: boolean
  /**
   * A phone on its side, where every point of ~400 counts (#623): a third of
   * the padding, the home indicator and the notch as the only margins, and the
   * whole width.
   */
  dense?: boolean
  children: ReactNode
}) {
  const { isTablet, isLandscape } = useLayout()
  const { height } = useWindowDimensions()
  // The context and not `useSafeAreaInsets`, which throws without a provider —
  // a sheet rendered outside one simply has no notch to keep off.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS
  const denseOnPhone = dense && !isTablet
  const sideways = isLandscape && !isTablet
  const keyboard = useKeyboardOverlap()
  const typing = keyboard > 0

  // The panel's ceiling. Typing, it is whatever the keyboard leaves under the
  // status bar — a sheet whose cap ran past the keyboard's top edge would put
  // its own foot, and the field, under it. A dialog keeps its margin above and
  // below; a sheet keeps the sliver of backdrop that says «sheet».
  const panelMaxHeight: DimensionValue = typing
    ? height - keyboard - insets.top - (isTablet ? BACKDROP_PADDING * 2 : SIDEWAYS_GAP)
    : sideways
      ? height - insets.top - SIDEWAYS_GAP
      : maxHeight

  return (
    // A dialog that slides up from the bottom edge to settle in the middle
    // reads as a sheet that stopped halfway; it fades in instead.
    <Modal
      transparent
      animationType={isTablet ? 'fade' : 'slide'}
      onRequestClose={onClose}
      supportedOrientations={MODAL_ORIENTATIONS}
    >
      <View
        testID={`${testID}-frame`}
        style={[
          s.frame,
          isTablet && s.frameCentred,
          // The panel stays inside the safe area, so the notch never sits over
          // a row. Zero standing up. A dense sheet takes the whole width and
          // pads its own content off the notch instead.
          !isTablet && !denseOnPhone && { paddingLeft: insets.left, paddingRight: insets.right },
          // Above the keyboard: a sheet sits on its top edge, a dialog centres
          // in what is left.
          typing && { paddingBottom: keyboard + (isTablet ? BACKDROP_PADDING : 0) },
        ]}
      >
        {/* The backdrop is the panel's sibling, behind it, and not its parent
            (#625). As the parent it closed the sheet on any tap the panel did
            not catch, so the panel caught them all with
            `onStartShouldSetResponder` — and a view holding the responder
            keeps the touch from the native scroll view under it. A sheet then
            scrolled only from a button: dragging on text, a label or a gap did
            nothing, which sideways, where every sheet scrolls, is most of it.

            It did the same to VoiceOver: a `Pressable` is one accessibility
            element, so wrapping the panel made the whole sheet a single
            element whose label was every line run together, and no row could
            be reached on its own. Behind the panel it is an element of its own
            — so it says what it does: VoiceOver has no tap outside a sheet,
            and several sheets have no close button. */}
        <Pressable
          testID={`${testID}-backdrop`}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
        <View
          testID={testID}
          style={[
            s.sheet,
            { maxHeight: panelMaxHeight },
            !isTablet && !denseOnPhone && s.phoneColumn,
            // Sideways the home indicator is 21pt, not 34: 40 would spend
            // twice what it clears, out of 400. Typing, there is no home
            // indicator under the panel at all, only the keyboard.
            sideways && !denseOnPhone && { paddingBottom: Math.max(insets.bottom, PADDING) },
            typing && !isTablet && !denseOnPhone && { paddingBottom: PADDING },
            denseOnPhone && {
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, DENSE_PADDING),
              paddingLeft: Math.max(insets.left, DENSE_PADDING),
              paddingRight: Math.max(insets.right, DENSE_PADDING),
            },
            isTablet && s.dialog,
            isTablet && wide && s.dialogWide,
          ]}
        >
          {/* The grab handle is a phone affordance: it says "this came up from
              the bottom edge and goes back down". A centred dialog has no such
              story, so it does not wear the badge for one. */}
          {!isTablet && (
            <View testID={`${testID}-handle`} style={[s.handle, denseOnPhone && s.handleDense]} />
          )}
          {children}
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  frame: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  frameCentred: { justifyContent: 'center', alignItems: 'center', padding: BACKDROP_PADDING },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: PADDING,
    // Clears the home indicator, which the sheet sits right on top of.
    paddingBottom: 40,
  },
  phoneColumn: { width: '100%', maxWidth: SHEET_MAX_WIDTH, alignSelf: 'center' },
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
