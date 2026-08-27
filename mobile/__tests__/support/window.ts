import { Dimensions } from 'react-native'

// ---------------------------------------------------------------------------
// Pinning the window size for a test (#446)
//
// `useLayout` reads `useWindowDimensions`, which is `Dimensions.get('window')`
// on first render and again from its effect — so pinning that one call is
// enough to render a screen at any size, without mocking the hook itself.
// ---------------------------------------------------------------------------

/** iPad Pro 12.9", standing up. */
export const TABLET_LARGE = { width: 1024, height: 1366 }
/** iPad Air / 11", standing up — the narrow end of the tablet range. */
export const TABLET_SMALL = { width: 834, height: 1112 }
/** Under the threshold: an iPad in Split View has a phone's width. */
export const PHONE_WIDTH = { width: 390, height: 844 }

// The genuine implementation, captured before anything spies on it.
const realGet = Dimensions.get.bind(Dimensions)
let spy: jest.SpyInstance<ReturnType<typeof Dimensions.get>> | null = null

/** Render at this window size until `resetWindowSize()`. */
export function setWindowSize({ width, height }: { width: number; height: number }) {
  spy ??= jest.spyOn(Dimensions, 'get')
  // 'screen' keeps answering for real: only the window is being staged.
  spy.mockImplementation((dim) =>
    dim === 'window' ? { ...realGet('window'), width, height } : realGet(dim),
  )
}

export function resetWindowSize() {
  spy?.mockRestore()
  spy = null
}
