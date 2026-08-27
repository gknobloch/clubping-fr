import type { ReactElement, ReactNode } from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'

// ---------------------------------------------------------------------------
// Rendering a screen in a test (#446)
//
// Screens sit in `Screen`, which reads the safe-area insets to keep their
// content off a landscape notch — and `useSafeAreaInsets` throws outright when
// no provider is above it. There is no window to measure in a test either, so
// the metrics are given rather than sensed.
//
// Import this `render` instead of the library's in any test that mounts a
// screen; the call sites stay as they were.
// ---------------------------------------------------------------------------

/** A notched phone standing up — what a screen test gets unless it says otherwise. */
export const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

/** The same phone on its side: no status bar, a notch on one end instead. */
export const PHONE_LANDSCAPE: Metrics = {
  frame: { x: 0, y: 0, width: 844, height: 390 },
  insets: { top: 0, left: 59, right: 59, bottom: 21 },
}

/** An iPad. No notch anywhere near the content — only width matters here. */
export const TABLET: Metrics = {
  frame: { x: 0, y: 0, width: 834, height: 1112 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
}

export function render(ui: ReactElement, { metrics = PHONE }: { metrics?: Metrics } = {}) {
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
    ),
  })
}
