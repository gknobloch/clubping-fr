import { useSyncExternalStore } from 'react'

// Moved out of RowActions (#608): the Accueil's trainings carousel pages two
// cards at a time from md: up, one below, and asks the same question.
//
// One media query for the whole page, not one per row: a list screen renders
// dozens of RowActions, and each subscribing separately would put dozens of
// listeners on the same query.
const DESKTOP = '(min-width: 768px)'

function subscribeToDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener('change', onChange)
  // `resize` as well: some embedded browsers resize the viewport without
  // emitting the media-query change, which would strand the menu in the wrong
  // presentation until the next navigation.
  window.addEventListener('resize', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
}

/** True from `md:` up, so a resize swaps the presentation with the layout. */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  )
}
