import type { MatchDay, Division, Group } from '@shared/types'
import { getMondayOf, getSundayOf, todayIso } from './weeks'

export { playersCommittedElsewhere, gameDate } from '@shared/lib/matchdays'

// A "journée" across the club: all the per-division MatchDay rows that share a
// number within a phase, plus the date span of their games.
export interface MatchDayGroup {
  number: number
  matchDays: MatchDay[]
  startDate: string // earliest date (YYYY-MM-DD)
  endDate: string // latest date
}

// Group a phase's match-days by their journée number, ordered by number.
export function getPhaseMatchDays(
  phaseId: string,
  matchDays: MatchDay[],
  groups: Group[],
  divisions: Division[],
): MatchDayGroup[] {
  const divPhase = new Map(divisions.map((d) => [d.id, d.phaseId]))
  const groupToPhase = new Map<string, string>()
  for (const g of groups) {
    const ph = divPhase.get(g.divisionId)
    if (ph) groupToPhase.set(g.id, ph)
  }

  const byNumber = new Map<number, MatchDay[]>()
  for (const md of matchDays) {
    if (groupToPhase.get(md.groupId) !== phaseId) continue
    byNumber.set(md.number, [...(byNumber.get(md.number) ?? []), md])
  }

  return [...byNumber.entries()]
    .map(([number, mds]) => {
      const dates = mds.map((m) => m.date).sort()
      return { number, matchDays: mds, startDate: dates[0], endDate: dates[dates.length - 1] }
    })
    .sort((a, b) => a.number - b.number)
}

// The "active" journée: the first whose games haven't fully passed, with a
// weekend tolerance — a Saturday round stays active through the following
// Sunday. Falls back to the last journée when every one is past.
export function activeMatchDayNumber(matchDayGroups: MatchDayGroup[]): number | null {
  if (matchDayGroups.length === 0) return null
  const today = todayIso()
  for (const g of matchDayGroups) {
    const effectiveEnd = getSundayOf(getMondayOf(g.endDate)) // Sunday of the last game's week
    if (today <= effectiveEnd) return g.number
  }
  return matchDayGroups[matchDayGroups.length - 1].number
}

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
