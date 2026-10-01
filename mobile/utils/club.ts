import { Platform } from 'react-native'
import type { Address, ClubChannelType } from '@shared/types'
import { formatAddress, mapsSearchUrl } from '@shared/lib/address'

// Club helpers, kept out of the screen: a file under app/ is a route, and
// expo-router expects a route to export a component, not utilities (#365).

/** Channel labels, matching the web's CHANNEL_TYPES (ClubDetailView.tsx). */
export const CHANNEL_LABELS: Record<ClubChannelType, string> = {
  website: 'Site web',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  other: 'Autre',
}

// One line, as one would write it on an envelope. Shared with the web, which
// prints the same address in the club screen and hands it to a calendar (#426).
export { formatAddress }

/**
 * Maps URL for a search — an address, or a town (#611). The platform schemes
 * hand it to the native maps app; the web's Google Maps URL is the fallback
 * for anything else.
 */
export function mapsQueryUrl(query: string): string {
  const q = encodeURIComponent(query)
  return Platform.select({
    ios: `maps://?q=${q}`,
    android: `geo:0,0?q=${q}`,
    default: mapsSearchUrl(query),
  })
}

/** Maps URL for an address. */
export const mapsUrl = (a: Address): string => mapsQueryUrl(formatAddress(a))
