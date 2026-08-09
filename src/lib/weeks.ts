// ---------------------------------------------------------------------------
// Week helpers. A "week" is keyed by its Monday date string ("2025-09-22").
// Shared with the native app via @shared/lib — see mobile/utils/weeks.ts.
// ---------------------------------------------------------------------------

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

export function getSundayOf(mondayStr: string): string {
  const d = new Date(mondayStr + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}
