
export { playersCommittedElsewhere, gameDate } from '@shared/lib/matchdays'
// The receiving club's time, and none when its playing day is unknown (#287,
// #427) — the same rule the web applies, from the same code.
export { gameSchedule, gameTime, isSlotConfirmed } from '@shared/lib/matchdays'
// Journée grouping lives in @shared/lib/matchdays so web and native agree on
// what "Journée N" means (#306).
export { getPhaseMatchDays, activeMatchDayNumber } from '@shared/lib/matchdays'
export type { MatchDayGroup, MatchDayScope } from '@shared/lib/matchdays'
// The journée's date range too (#450): it was copied here, and the copy was
// the only one of the two that kept the month on both ends of a range
// spanning two months.
export { formatMatchDayRange } from '@shared/lib/matchdays'
