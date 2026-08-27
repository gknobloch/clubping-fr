import { renderHook } from '@testing-library/react-native'
import { CONTENT_MAX_WIDTH, TABLET_MIN_SIDE, useLayout } from './layout'
import {
  PHONE_WIDTH,
  TABLET_LARGE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'

// ---------------------------------------------------------------------------
// What the app thinks it occupies (#446). Everything laid out for a tablet
// hangs off this one answer, and the answer is the window's width — not the
// device's, because an iPad in Split View is a phone-width window on a slab.
// ---------------------------------------------------------------------------
afterEach(resetWindowSize)

const layout = () => renderHook(() => useLayout()).result.current

it('calls a phone a phone', () => {
  setWindowSize(PHONE_WIDTH)

  expect(layout().isTablet).toBe(false)
})

it.each([
  ['an 11-inch iPad', TABLET_SMALL],
  ['a 12.9-inch iPad', TABLET_LARGE],
])('calls %s a tablet', (_name, size) => {
  setWindowSize(size)

  expect(layout().isTablet).toBe(true)
})

it('turns over at the threshold itself, not around it', () => {
  setWindowSize({ width: TABLET_MIN_SIDE - 1, height: 1024 })
  expect(layout().isTablet).toBe(false)

  setWindowSize({ width: TABLET_MIN_SIDE, height: 1024 })
  expect(layout().isTablet).toBe(true)
})

it('does not promote a phone turned sideways', () => {
  // An iPhone 17 in landscape is 874 wide — wider than any tablet threshold
  // read off the width alone, and still 402pt tall. Its short side is what
  // says so.
  setWindowSize({ width: 874, height: 402 })

  expect(layout().isTablet).toBe(false)
})

it('does not demote a small tablet standing up', () => {
  // An iPad mini is 744×1133: narrower than a landscape phone, and a tablet.
  setWindowSize({ width: 744, height: 1133 })

  expect(layout().isTablet).toBe(true)
})

it('reads a split-screen iPad as the phone-shaped window it is', () => {
  // The point of measuring the window and not the device: half of a 1024pt
  // slab is 507pt, and two columns of anything in it would be unreadable.
  setWindowSize({ width: 507, height: 1366 })

  expect(layout().isTablet).toBe(false)
})

it('knows which way round it is', () => {
  setWindowSize({ width: 844, height: 390 })
  expect(layout().isLandscape).toBe(true)

  setWindowSize({ width: 390, height: 844 })
  expect(layout().isLandscape).toBe(false)
})

it('reports the window width and the reading width', () => {
  setWindowSize(TABLET_LARGE)

  expect(layout().width).toBe(TABLET_LARGE.width)
  expect(layout().contentMaxWidth).toBe(CONTENT_MAX_WIDTH)
})
