// ---------------------------------------------------------------------------
// Week helpers — shared by the Accueil, Journées list and week-detail screens.
// A "week" is keyed by its Monday date string (e.g. "2025-09-22").
//
// The date arithmetic lives in @shared/lib/weeks so the web app and this one
// cannot drift on what a week is; only the RN-facing label stays here.
// ---------------------------------------------------------------------------

export { todayIso, getMondayOf, getSundayOf } from '@shared/lib/weeks'

export function formatWeekRange(mondayStr: string): string {
  const mo = new Date(mondayStr + 'T12:00:00')
  const su = new Date(mo)
  su.setDate(mo.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  return `Lu ${fmt(mo)} au Di ${fmt(su)}`
}
