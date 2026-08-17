import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Reset the document scroll to the top on route changes (#400). React Router 6
 * does not do this, and the browser does not reset scroll on a `pushState`
 * navigation, so a new page inherits the previous page's scroll position.
 * Journées makes this obvious because it scrolls itself via `scrollIntoView` on
 * team anchors, leaving the document far from the top for the next screen.
 *
 * Kept deliberately narrow:
 * - Only resets when the `pathname` changes, so an in-page hash update is left
 *   alone. (Journées writes `#team-…` via `replaceState`, which never reaches
 *   React Router, but a genuine hash-only navigation must not fight the anchor
 *   scroll either.)
 * - Skips a landing hash, so a deep link like `/journees#team-…` still scrolls
 *   to its anchor rather than being forced back to the top.
 * - Skips browser back/forward (POP), where the browser restores the previous
 *   position itself.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  const prevPathname = useRef(pathname)

  useEffect(() => {
    const pathnameChanged = prevPathname.current !== pathname
    prevPathname.current = pathname
    if (!pathnameChanged) return // hash-only change: leave the scroll alone
    if (navigationType === 'POP') return // let the browser restore the position
    if (hash) return // a deep link's anchor scroll wins over the reset
    window.scrollTo(0, 0)
  }, [pathname, hash, navigationType])

  return null
}
