// One address, one person (#655, « 4 bis »).
//
// Shared domain logic — imported by the web app (@/lib/addressOwner), the
// mobile app (@shared/lib/addressOwner) and the API. Keep this module free of
// any browser/RN/Node deps.
//
// The sign-in code goes to an address, so an address opens one person — and
// that person's profiles, and those of whoever delegated to them. A parent and
// a child no longer share one: the child has none, or their own, and the
// parent is their delegate. What existed before this rule is settled by the
// general admin (« Adresses partagées », #655 step 3); this keeps new ones
// from being made.
import type { User } from '../types'

const addressOf = (email: string | null | undefined) => email?.trim().toLowerCase() ?? ''

type Member = Pick<User, 'id' | 'personId' | 'email' | 'firstName' | 'lastName'>

/**
 * The member of ANOTHER person who already uses this address, if any —
 * `exceptPersonId` (and `exceptId`, for a profile with no person) being the
 * one the address is meant for. No address belongs to nobody.
 */
export function addressOwner<M extends Member>(
  email: string | null | undefined,
  members: readonly M[],
  except: { personId?: string; id?: string } = {},
): M | undefined {
  const address = addressOf(email)
  if (!address) return undefined
  return members.find((m) =>
    addressOf(m.email) === address
    && !(except.personId && m.personId === except.personId)
    && !(except.id && m.id === except.id))
}

const nameOf = (m: { firstName?: string | null; lastName?: string | null }) =>
  [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || 'un autre membre'

/** What a form and the API say when an address is someone else's. */
export function addressTakenMessage(owner: { firstName?: string | null; lastName?: string | null }): string {
  return `Cette adresse est déjà celle de ${nameOf(owner)} : une adresse ne sert qu’à une personne. `
    + `Laissez-la vide et faites de ${nameOf(owner)} un délégué, ou indiquez l’adresse de la personne elle-même.`
}
