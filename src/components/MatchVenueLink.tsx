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
      className={`group flex min-h-11 gap-1.5 text-sm text-slate-500 hover:text-accent-700 md:min-h-0 ${name ? 'items-start py-1 md:py-0' : 'items-center'} ${className}`}
    >
      {/* Level with the first line, whichever it is: two lines centred on the
          icon would leave it pointing between the hall and its street. */}
      <MapPinIcon className={`h-4 w-4 shrink-0 text-slate-400 group-hover:text-accent-600 ${name ? 'mt-0.5' : ''}`} />
      <span className="min-w-0">
        {/* The hall, then where it is: two lines, the way an address is written. */}
        {name && <span className="block">{name}</span>}
        <span className="block underline decoration-slate-300 underline-offset-2 group-hover:decoration-accent-400">{line}</span>
      </span>
    </a>
  )
}
