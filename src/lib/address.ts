// Shared domain logic — imported by the web app (@/lib/address) and the mobile
// app (@shared/lib/address). Keep this module free of any browser/RN/Node deps.
import type { Address } from '../types'

/** Full address on one line, as one would write it on an envelope. */
export function formatAddress(a: Address): string {
  return `${a.street}, ${a.postalCode} ${a.city}`
}
