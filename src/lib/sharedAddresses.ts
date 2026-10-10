// Addresses two people share, and what the general admin does about them (#655).
//
// Shared domain logic — keep this module free of any browser/RN/Node deps.
//
// Before #655 a parent opened a child's profile because the child's profile
// carried the parent's address (#640). Migration 0063 folded one address and
// one name into one person, and could not do more: one address, two names is a
// parent and a child, or two spouses, and nothing in the data says which one
// the address belongs to. The general admin says so — the keeper keeps it, and
// becomes the delegate of each other person, whose address is emptied. Nothing
// is lost on the way: a delegate opens the same profiles the shared address
// did, and the other can later sign in with an address of their own.
//
// Or the two are one human, created twice — typically a general admin's
// profile written without a name beside the profiles they play under. Then the
// answer is to merge them (`mergeTarget` says which one stays).
import type { User } from '../types'

type Member = Pick<User, 'id' | 'personId' | 'email' | 'firstName' | 'lastName' | 'clubId'> & { role?: User['role'] }

export interface SharedAddressPerson {
  personId: string
  firstName?: string
  lastName?: string
  /** Their club profiles, in list order — a general admin's among them. */
  profiles: Array<{ userId: string; clubId?: string; generalAdmin?: true }>
}

export interface SharedAddress {
  /** As the first profile spells it. */
  email: string
  people: SharedAddressPerson[]
}

const addressOf = (m: Pick<User, 'email'>) => m.email?.trim().toLowerCase() ?? ''

const byName = (a: SharedAddressPerson, b: SharedAddressPerson) =>
  (a.lastName ?? '').localeCompare(b.lastName ?? '', 'fr') || (a.firstName ?? '').localeCompare(b.firstName ?? '', 'fr')

/**
 * Every address more than one person uses, by address. Compared as at sign-in
 * (`reaches`): case and surrounding space aside, and no address shares
 * nothing. A member with no person — a row written in the deploy window of
 * 0063 — is left out: there is no person to hand an address over to.
 */
export function sharedAddresses(members: readonly Member[]): SharedAddress[] {
  const byAddress = new Map<string, { email: string; people: Map<string, SharedAddressPerson> }>()
  for (const m of members) {
    const address = addressOf(m)
    if (!address || !m.personId) continue
    const entry = byAddress.get(address) ?? { email: m.email!.trim(), people: new Map() }
    byAddress.set(address, entry)
    const person = entry.people.get(m.personId)
      ?? { personId: m.personId, firstName: m.firstName, lastName: m.lastName, profiles: [] }
    entry.people.set(m.personId, person)
    person.profiles.push({
      userId: m.id, clubId: m.clubId, ...(m.role === 'general_admin' ? { generalAdmin: true as const } : {}),
    })
  }
  return [...byAddress.entries()]
    .filter(([, e]) => e.people.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, e]) => ({ email: e.email, people: [...e.people.values()].sort(byName) }))
}

/** The shared address a person is part of, if any. */
export function sharedAddressOf(personId: string, members: readonly Member[]): SharedAddress | undefined {
  return sharedAddresses(members).find((s) => s.people.some((p) => p.personId === personId))
}

/**
 * Of two people found to be one, the one that stays: the one with a name — a
 * general admin's profile is often written without one —, then the one with
 * more profiles, then the first by name (#655).
 */
export function mergeTarget(group: SharedAddress): SharedAddressPerson {
  const named = (p: SharedAddressPerson) => Number(!!(p.firstName?.trim() || p.lastName?.trim()))
  return [...group.people].sort((a, b) => named(b) - named(a) || b.profiles.length - a.profiles.length)[0]
}
