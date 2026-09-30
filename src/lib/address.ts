// Shared domain logic — imported by the web app (@/lib/address) and the mobile
// app (@shared/lib/address). Keep this module free of any browser/RN/Node deps.
import type { Address } from '../types'

/**
 * Full address on one line, as one would write it on an envelope. A part the
 * club left blank is dropped rather than printed as a stray comma — an address
 * imported with a city and no street still reads « 68170 Rixheim ».
 */
export function formatAddress(a: Address): string {
  const town = [a.postalCode, a.city].map((s) => s?.trim()).filter(Boolean).join(' ')
  return [a.street?.trim(), town].filter(Boolean).join(', ')
}

/**
 * A maps search for an address that opens anywhere: Google's cross-platform
 * URL, which a phone hands to its maps app and a desktop opens in the browser.
 * The query is the street address alone — a venue's name is for people, and a
 * geocoder asked for « Salle des sports » finds a hundred of them (#611).
 */
export function mapsSearchUrl(a: Address): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(a))}`
}
