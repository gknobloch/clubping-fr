import { useLayoutEffect, type RefObject } from 'react'

/**
 * How far below the viewport top an anchored element has to land so it clears
 * the sticky chrome above it.
 *
 * The chrome is two stacked pieces: AppShell's app bar, which is always there,
 * and a page toolbar, which only some screens have and whose height changes
 * with the viewport (its controls wrap, and the club name is longer for some
 * clubs). MatchDaysPage used to hardcode the total as `scroll-mt-[195px]`,
 * which silently mislanded "aller à l'équipe X" as soon as the real height
 * differed — the section either hid under the toolbar or stopped short.
 *
 * So the total is measured instead and published as a CSS custom property that
 * anchors consume via `scroll-mt-[var(--page-scroll-offset)]`. index.css seeds
 * it with the no-toolbar value so screens without one need no JS at all.
 */

/** AppShell's sticky app bar — `h-14`. */
export const APP_HEADER_HEIGHT = 56

/** Breathing room between the sticky chrome and the element scrolled to. */
export const SCROLL_GUTTER = 12

export const SCROLL_OFFSET_VAR = '--page-scroll-offset'

/** The value index.css seeds, and what we fall back to with no toolbar mounted. */
export const BASE_SCROLL_OFFSET = APP_HEADER_HEIGHT + SCROLL_GUTTER

/**
 * Publishes `--page-scroll-offset` for as long as `ref`'s element is mounted,
 * keeping it in sync with that element's height. Restores the seeded value on
 * unmount so a screen without a toolbar never inherits the previous screen's
 * offset.
 */
export function usePageScrollOffset(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const root = document.documentElement
    const publish = () => {
      const height = el.getBoundingClientRect().height
      root.style.setProperty(SCROLL_OFFSET_VAR, `${Math.round(APP_HEADER_HEIGHT + height + SCROLL_GUTTER)}px`)
    }
    publish()

    // happy-dom has no ResizeObserver; the initial measurement above is all the
    // unit tests need, so skip the subscription rather than shimming it.
    if (typeof ResizeObserver === 'undefined') {
      return () => root.style.removeProperty(SCROLL_OFFSET_VAR)
    }

    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(SCROLL_OFFSET_VAR)
    }
  }, [ref])
}
