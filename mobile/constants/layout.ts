import { useWindowDimensions } from 'react-native'

// ---------------------------------------------------------------------------
// What the app occupies (#446)
//
// Until now nothing in the app knew its own width: two files called
// `useWindowDimensions` and everything else assumed a phone. That assumption is
// what turns an iPad into a phone screen stretched to 1024pt — hundred-character
// lines, a card with its badge at one edge and its chevron at the other, and a
// bottom sheet that is a 200pt band across the foot of the slab.
//
// Two things are worth stating once, here, because both are only obvious after
// they have gone wrong:
//
//   * `useWindowDimensions`, never `Dimensions.get()`. Split View and Stage
//     Manager resize the window while the app runs; a value sampled once at
//     module load is wrong the moment someone drags the divider.
//   * `Platform.isPad` does not answer the question. An iPad in Split View gets
//     a phone's width, and Android has no such flag. Width decides, not device.
// ---------------------------------------------------------------------------

/**
 * A tablet is a window whose *smallest* side reaches this, which is the same
 * measure Android calls `sw600dp`.
 *
 * The short side and not the width, because a phone turned sideways is wider
 * than this and is still a phone: an iPhone 17 in landscape is 874×402, and
 * reading its width alone hands a 402pt-tall screen a tablet's layout. An iPad
 * mini standing up is 744×1133, and reading its width alone would deny a tablet
 * its own layout. The short side gets both right, and still answers about the
 * window rather than the device — half a slab in Split View is 507 wide and
 * lays out as the phone-shaped window it is.
 */
export const TABLET_MIN_SIDE = 600

/**
 * One column of reading. Wider than this and a line of French runs past the
 * ~90 characters the eye can track back from; card rows stop being rows and
 * become two things far apart.
 */
export const CONTENT_MAX_WIDTH = 640

/**
 * The list pane of a two-pane section (#447). Wide enough for a team card —
 * badge, name and level — and no wider: every point it takes is one the fiche
 * beside it does not get.
 */
export const LIST_PANE_WIDTH = 320

export interface Layout {
  /** Window width in points — the window's, not the screen's (Split View). */
  width: number
  isTablet: boolean
  isLandscape: boolean
  contentMaxWidth: number
  /**
   * The tab bar leaves the foot of the window and becomes a rail down its left
   * edge (#447). A slab held sideways has width to spare and is short of
   * height, which is exactly the trade a rail makes; standing up it has
   * neither problem, and the row it has always had is the familiar thing.
   */
  hasSideRail: boolean
  /**
   * A section shows its list and the selected fiche side by side (#447).
   *
   * This is `isTablet` and deliberately nothing more: that rule reads off the
   * window's *short* side, so it survives a rotation. Tying it to landscape
   * would change what a tap does halfway through a turn of the wrist — the
   * same gesture pushing a screen one moment and selecting a row the next.
   */
  isTwoPane: boolean
}

/** What this window is, for the components that lay themselves out from it. */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions()
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE
  const isLandscape = width > height
  return {
    width,
    isTablet,
    isLandscape,
    contentMaxWidth: CONTENT_MAX_WIDTH,
    hasSideRail: isTablet && isLandscape,
    isTwoPane: isTablet,
  }
}
