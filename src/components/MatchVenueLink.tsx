import { formatAddress, mapsSearchUrl } from '@/lib/address'
import type { MatchVenue } from '@/lib/venue'
import { MapPinIcon } from '@/components/icons'

/**
 * Where the match is played (#611): the hall's name when the home team set
 * one, the address under it, and the whole block a link to the maps search —
 * on a phone, that is the maps app with the route one tap away.
 *
 * Renders nothing without a venue: an away match at a club that does not use
 * the app has no address on file, and a blank line would say less than none.
 */
export function MatchVenueLink({ venue, className = '' }: { venue: MatchVenue | undefined; className?: string }) {
  if (!venue) return null
  const address = formatAddress(venue.address)
  return (
    <a
      href={mapsSearchUrl(venue.address)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${venue.name ? `${venue.name}, ` : ''}${address} — ouvrir dans le plan`}
      className={`group flex min-h-11 items-center gap-1.5 text-sm text-slate-500 hover:text-accent-700 md:min-h-0 ${className}`}
    >
      <MapPinIcon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-accent-600" />
      <span className="min-w-0">
        {venue.name && <span className="font-medium text-slate-700 group-hover:text-accent-700">{venue.name} · </span>}
        <span className="underline decoration-slate-300 underline-offset-2 group-hover:decoration-accent-400">{address}</span>
      </span>
    </a>
  )
}
