import { UNCONFIRMED_SLOT_HINT } from '@/lib/matchdays'

/**
 * A fixture's date, marked when nobody has confirmed it (#429).
 *
 * The FFTT publishes a nominal week-end date, and the import moves a home
 * fixture onto the receiving club's playing day. At a club created by that
 * import we know no playing day, so the date is a guess — the Journées matrix
 * has said so since #287, and every other screen printed it as fact.
 *
 * The date stays visible rather than becoming "semaine du …": on a table row
 * or a phone card, a week range costs more than the reservation is worth. The
 * amber and the wording are the matrix's, so the two read as one statement.
 */
export function MatchDate({
  label,
  confirmed,
  className = '',
}: {
  /** The date, already formatted for its screen. */
  label: string
  confirmed: boolean
  className?: string
}) {
  if (confirmed) return <span className={className}>{label}</span>
  return (
    <span className={`text-amber-700 ${className}`} title={UNCONFIRMED_SLOT_HINT}>
      <span aria-hidden="true">⚠ </span>
      <span className="sr-only">Date à confirmer, </span>
      {label}
    </span>
  )
}
