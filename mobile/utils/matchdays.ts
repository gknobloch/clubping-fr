
export { playersCommittedElsewhere, gameDate } from '@shared/lib/matchdays'
// The receiving club's time, and none when its playing day is unknown (#287,
// #427) — the same rule the web applies, from the same code.
export { gameSchedule, gameTime, isSlotConfirmed } from '@shared/lib/matchdays'
// Journée grouping lives in @shared/lib/matchdays so web and native agree on
// what "Journée N" means (#306).
export { getPhaseMatchDays, activeMatchDayNumber } from '@shared/lib/matchdays'
export type { MatchDayGroup } from '@shared/lib/matchdays'

// Date-range label, e.g. "sam 27 oct" or "sam 27 – dim 28 oct".
export function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (d: string, withMonth: boolean) =>
    new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
    })
  if (startDate === endDate) return fmt(startDate, true)
  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7)
  return `${fmt(startDate, !sameMonth)} – ${fmt(endDate, true)}`
}
