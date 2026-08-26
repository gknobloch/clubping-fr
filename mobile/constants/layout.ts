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

/** Above this width the app lays out for a tablet. Below it, for a phone. */
export const TABLET_MIN_WIDTH = 768

/**
 * One column of reading. Wider than this and a line of French runs past the
 * ~90 characters the eye can track back from; card rows stop being rows and
 * become two things far apart.
 */
export const CONTENT_MAX_WIDTH = 640

export interface Layout {
  /** Window width in points — the window's, not the screen's (Split View). */
  width: number
  isTablet: boolean
  isLandscape: boolean
  contentMaxWidth: number
}

/** What this window is, for the components that lay themselves out from it. */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions()
  return {
    width,
    isTablet: width >= TABLET_MIN_WIDTH,
    isLandscape: width > height,
    contentMaxWidth: CONTENT_MAX_WIDTH,
  }
}
