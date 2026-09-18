// ---------------------------------------------------------------------------
// Week helpers. A "week" is keyed by its Monday date string ("2025-09-22").
// Shared with the native app via @shared/lib — see mobile/utils/weeks.ts.
// ---------------------------------------------------------------------------

/**
 * A civil date ("2026-09-18") read off the local calendar.
 *
 * Never `toISOString()`, which converts to UTC first: east of Greenwich that
 * turns the first hour or two of every day into yesterday's date (#561). Every
 * date this app compares — a game's, a journée's — is a civil date carrying no
 * timezone at all, so the one it compares them *to* has to be civil too.
 */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayIso(): string {
  return isoDate(new Date())
}

export function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return isoDate(d)
}

export function getSundayOf(mondayStr: string): string {
  const d = new Date(mondayStr + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return isoDate(d)
}
