import { Platform } from 'react-native'
import type { Address, ClubChannelType } from '@shared/types'

// Club helpers, kept out of the screen: a file under app/ is a route, and
// expo-router expects a route to export a component, not utilities (#365).

/** Channel labels, matching the web's CHANNEL_TYPES (ClubDetailView.tsx). */
export const CHANNEL_LABELS: Record<ClubChannelType, string> = {
  website: 'Site web',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  other: 'Autre',
}

/** Full address on one line, as one would write it on an envelope. */
export function formatAddress(a: Address): string {
  return `${a.street}, ${a.postalCode} ${a.city}`
}

/**
 * Maps URL for an address. The platform schemes hand the address to the native
 * maps app; the web Google Maps URL is the fallback for anything else.
 */
export function mapsUrl(a: Address): string {
  const query = encodeURIComponent(formatAddress(a))
  return Platform.select({
    ios: `maps://?q=${query}`,
    android: `geo:0,0?q=${query}`,
    default: `https://www.google.com/maps/search/?api=1&query=${query}`,
  })
}
