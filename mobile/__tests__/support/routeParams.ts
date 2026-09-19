import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Les paramètres de route, dans un test (#585)
//
// A two-pane section keeps its selection in the route, so a test that taps a
// row and expects the fiche beside it needs the round trip: `setParams` writes,
// `useLocalSearchParams` reads, and the screen **re-renders** in between.
//
// A plain `jest.fn()` gives the first two and not the third, which is the one
// that matters — the tap would be recorded and the pane would stay empty. Hence
// a real store with subscribers rather than a mutable object.
//
// Used from a `jest.mock('expo-router', …)` factory, which may only reach names
// beginning with `mock` — hence the aliases:
//
//   import { setParams, useParams } from '@/__tests__/support/routeParams'
//   const mockSetParams = setParams
//   const mockUseParams = useParams
//   jest.mock('expo-router', () => ({
//     useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
//     useLocalSearchParams: () => mockUseParams(),
//   }))
// ---------------------------------------------------------------------------

type Params = Record<string, string | undefined>

let params: Params = {}
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** What `router.setParams` does: merge, then wake the screens reading it. */
export function setParams(next: Params) {
  params = { ...params, ...next }
  emit()
}

/** Arrive with a selection already made — a deep link, or a tap from elsewhere. */
export function givenParams(next: Params = {}) {
  params = next
  emit()
}

/** Back to nothing selected. Call it in `beforeEach`, as tests share a module. */
export function resetParams() {
  givenParams({})
}

export function useParams(): Params {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    // The reference only changes when a write happens, which is what
    // `useSyncExternalStore` requires of a snapshot: a fresh object every call
    // would re-render for ever.
    () => params,
  )
}
