// Ordering phases, and picking the one a screen opens on (#432).
//
// Shared domain logic — imported by the web app (@/lib/phases) and the mobile
// app (@shared/lib/phases). Keep this module free of any browser/RN/Node deps.
//
// Every switcher had its own copy of the sort, and the Journées page had none
// at all: it paged through `phases` in the order the API happened to return,
// so "phase précédente" was not reliably the previous phase.

import type { Phase } from '../types'

/**
 * Phases oldest first.
 *
 * `displayName` ("2025/2026 Phase 1") sorts chronologically as plain text —
 * season first, phase number second — which is why it, and not the id or the
 * insertion order, is the key.
 */
export function orderPhases(phases: Phase[]): Phase[] {
  return [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * The phase a screen opens on: the active one, and failing that the most
 * recent. A club with no active phase — between two seasons, or right after an
 * import — lands on the newest rather than on whatever came back first.
 *
 * Screens reached from a link that names a phase (a fixture, a team) set that
 * phase instead; this is only the default.
 */
export function defaultPhase(phases: Phase[]): Phase | undefined {
  const ordered = orderPhases(phases)
  return phases.find((p) => p.status === 'active') ?? ordered[ordered.length - 1]
}
