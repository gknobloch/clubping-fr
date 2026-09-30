import { mapsSearchUrl } from '@/lib/address'
import { venueText, type MatchVenue } from '@/lib/venue'
import { MapPinIcon } from '@/components/icons'

/**
 * Where the match is played (#611): the hall's name when the home team set
 * one, the address under it — or, with no address on file, the town the home
 * club's name carries — and the whole block a link to the maps search. On a
 * phone, that is the maps app with the route one tap away.
 *
 * Renders nothing without a venue: a blank line would say less than none.
 */
export function MatchVenueLink({ venue, className = '' }: { venue: MatchVenue | undefined; className?: string }) {
  if (!venue) return null
  const { name, line, query } = venueText(venue)
  return (
    <a
      href={mapsSearchUrl(query)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name ? `${name}, ` : ''}${line} — ouvrir dans le plan`}
      className={`group flex min-h-11 items-center gap-1.5 text-sm text-slate-500 hover:text-accent-700 md:min-h-0 ${className}`}
    >
      <MapPinIcon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-accent-600" />
      <span className="min-w-0">
        {name && <span className="font-medium text-slate-700 group-hover:text-accent-700">{name} · </span>}
        <span className="underline decoration-slate-300 underline-offset-2 group-hover:decoration-accent-400">{line}</span>
      </span>
    </a>
  )
}
