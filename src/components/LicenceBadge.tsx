import { LICENCE_MISSING_LABEL } from '@/lib/seasonLicences'

/**
 * "Sans licence" — the federation did not list this member's licence for the
 * season (#488).
 *
 * Amber, not red: it is not an error, and most of the time it is a renewal that
 * has not gone through yet. But it is next to the name everywhere the name is,
 * because the moment it matters is the moment somebody puts them on a team
 * sheet without thinking about it.
 */
export function LicenceBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="La FFTT n’a pas listé sa licence pour cette saison."
      className={`shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ${className}`}
    >
      {LICENCE_MISSING_LABEL}
    </span>
  )
}
