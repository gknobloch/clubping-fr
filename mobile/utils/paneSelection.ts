import { useCallback, useEffect, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

// ---------------------------------------------------------------------------
// Quelle ligne est ouverte à côté de la liste (#585)
//
// A two-pane section (#447) held its selection in a `useState` local to the
// screen, which answers every question except the one #585 asks: arriving from
// somewhere else with a row already open. A tap in the Journées matrix cannot
// reach the Équipes tab's private state, so the fiche it wanted had nowhere to
// be said.
//
// So the selection lives in the route instead — `/equipes?selected=t1`,
// `/joueurs?selected=p3`. That is the whole of it: the value is readable by
// anyone who can navigate, and a deep link opens the same screen as a tap.
//
// It is set **in place** (`setParams`), never pushed (#552): the back button
// must leave the section, not replay every fiche read inside it.
// ---------------------------------------------------------------------------

export function usePaneSelection({
  onArrival,
}: {
  /**
   * Called with a selection this screen did **not** make — a deep link, a tap
   * from another tab, or the one the screen opens with. That is exactly when
   * the row has to be brought into view, and exactly when scrolling is safe:
   * moving the list under a finger that just tapped a row would be the screen
   * pulling itself out from under the tap.
   */
  onArrival?: (id: string) => void
} = {}) {
  const router = useRouter()
  const params = useLocalSearchParams<{ selected?: string | string[] }>()
  // A param can arrive repeated («?selected=a&selected=b»); the first wins.
  const raw = Array.isArray(params.selected) ? params.selected[0] : params.selected
  const selectedId = raw && raw.length > 0 ? raw : null

  // Held in a ref so the effect below depends on the selection alone: an
  // inline closure would re-run it on every render the screen does.
  const arrival = useRef(onArrival)
  arrival.current = onArrival

  const pressedHere = useRef(false)
  const previous = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (previous.current === selectedId) return
    const isFirst = previous.current === undefined
    previous.current = selectedId
    const fromThisScreen = pressedHere.current
    pressedHere.current = false
    if (selectedId && (isFirst || !fromThisScreen)) arrival.current?.(selectedId)
  }, [selectedId])

  const select = useCallback(
    (id: string) => {
      pressedHere.current = true
      router.setParams({ selected: id })
    },
    [router],
  )

  return { selectedId, select }
}
