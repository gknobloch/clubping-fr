import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View, type DimensionValue } from 'react-native'
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

export function Sheet({
  onClose,
  /** Share of the window the panel may grow to. */
  maxHeight = '85%',
  testID = 'sheet',
  children,
}: {
  onClose: () => void
  maxHeight?: DimensionValue
  testID?: string
  children: ReactNode
}) {
  const { isTablet } = useLayout()

  return (
    // A dialog that slides up from the bottom edge to settle in the middle
    // reads as a sheet that stopped halfway; it fades in instead.
    <Modal transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable
        testID={`${testID}-backdrop`}
        style={[s.backdrop, isTablet && s.backdropCentred]}
        onPress={onClose}
      >
        {/* View + onStartShouldSetResponder stops the backdrop from closing when
            tapping the panel, without competing with nested TouchableOpacity rows */}
        <View
          testID={testID}
          style={[s.sheet, { maxHeight }, isTablet && s.dialog]}
          onStartShouldSetResponder={() => true}
        >
          {/* The grab handle is a phone affordance: it says "this came up from
              the bottom edge and goes back down". A centred dialog has no such
              story, so it does not wear the badge for one. */}
          {!isTablet && <View testID={`${testID}-handle`} style={s.handle} />}
          {children}
        </View>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdropCentred: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    // Clears the home indicator, which the sheet sits right on top of.
    paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12,
  },
  dialog: {
    width: '100%',
    maxWidth: DIALOG_MAX_WIDTH,
    borderRadius: 20,
    paddingBottom: 24,
  },
})
