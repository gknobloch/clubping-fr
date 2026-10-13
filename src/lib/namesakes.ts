// One human, two people, and no address to say so (#731).
//
// Shared domain logic — keep this module free of any browser/RN/Node deps:
// the API runs the same refusal before it merges anything.
//
// The AGR list of Landser was imported as sixteen new people, nine of whom
// already played at Rixheim under the FFTT. Nothing joined them: the AGR gives
// no address, and « C'est la même personne » (#655) was only offered to two
// people sharing one. Their Landser profile had no address, so they could not
// open it either. The same name in two clubs is what is left to go on — a
// question for the general admin, never a merge on its own: a father and a son
// can share a name, and play in two clubs.
import type { User } from '../types'

type Member = Pick<User, 'id' | 'personId' | 'email' | 'firstName' | 'lastName' | 'clubId'>

export interface MergeablePerson {
  personId: string
  firstName?: string
  lastName?: string
  /** The person's address, as their profiles carry it. */
  email?: string
  profiles: Array<{ userId: string; clubId?: string }>
}

export interface Namesake {
  /** As the first profile spells it. */
  name: string
  people: [MergeablePerson, MergeablePerson]
}

/** Accents, case, hyphens and spaces aside: « Jean-Pierre Séguy » is « jean pierre seguy ». */
export const personNameKey = (first: string | undefined, last: string | undefined) =>
  `${first ?? ''} ${last ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]+/g, ' ').trim()

const addressOf = (p: Pick<MergeablePerson, 'email'>) => p.email?.trim().toLowerCase() ?? ''

/**
 * Of two people found to be one, the one that stays: the one with an address
 * — it is how they sign in, and the API will not move an address onto
 * another person (0068) —, then the one with more profiles.
 */
export function personMergeTarget(a: MergeablePerson, b: MergeablePerson): { keep: MergeablePerson; remove: MergeablePerson } {
  const rank = (p: MergeablePerson) => [Number(!!addressOf(p)), p.profiles.length]
  const [ra, rb] = [rank(a), rank(b)]
  const aFirst = ra[0] !== rb[0] ? ra[0] > rb[0] : ra[1] >= rb[1]
  return aFirst ? { keep: a, remove: b } : { keep: b, remove: a }
}

export type PersonMergeRefusal =
  | { reason: 'two_addresses'; message: string }
  | { reason: 'keep_other'; message: string }
  | { reason: 'same_club'; message: string }

/**
 * Why `remove` cannot be folded into `keep` — or null. Two addresses are two
 * ways in, and which one is right is not this rule's to say; a profile in the
 * same club on both sides is a duplicate to delete, not a second club.
 */
export function personMergeRefusal(keep: MergeablePerson, remove: MergeablePerson): PersonMergeRefusal | null {
  const a = addressOf(keep)
  const b = addressOf(remove)
  if (a && b && a !== b) {
    return { reason: 'two_addresses', message: 'Ces deux personnes ont chacune leur adresse : ce sont deux comptes.' }
  }
  if (b && !a) {
    return { reason: 'keep_other', message: 'C’est la personne qui a une adresse qui doit être gardée.' }
  }
  const clubs = new Set(keep.profiles.map((p) => p.clubId).filter(Boolean))
  if (remove.profiles.some((p) => p.clubId && clubs.has(p.clubId))) {
    return {
      reason: 'same_club',
      message: 'Les deux ont un profil dans le même club : supprimez le doublon plutôt que de les réunir.',
    }
  }
  return null
}

/** Every person, with their profiles — those written without a person left out. */
export function peopleOf(members: readonly Member[]): MergeablePerson[] {
  const byPerson = new Map<string, MergeablePerson>()
  for (const m of members) {
    if (!m.personId) continue
    const person = byPerson.get(m.personId)
      ?? { personId: m.personId, firstName: m.firstName, lastName: m.lastName, profiles: [] }
    if (!person.email && m.email?.trim()) person.email = m.email.trim()
    person.profiles.push({ userId: m.id, clubId: m.clubId })
    byPerson.set(m.personId, person)
  }
  return [...byPerson.values()]
}

/**
 * Pairs of people with one name, in different clubs, that could be merged:
 * no two addresses, no club in common. A name three people carry is left
 * out — which two would be a guess.
 */
export function namesakes(members: readonly Member[]): Namesake[] {
  const byName = new Map<string, MergeablePerson[]>()
  for (const p of peopleOf(members)) {
    const key = personNameKey(p.firstName, p.lastName)
    if (!key) continue
    byName.set(key, [...(byName.get(key) ?? []), p])
  }
  return [...byName.entries()]
    .filter(([, people]) => people.length === 2)
    .flatMap(([key, [a, b]]) => {
      const { keep, remove } = personMergeTarget(a, b)
      return personMergeRefusal(keep, remove)
        ? []
        : [{ key, name: [keep.firstName, keep.lastName].filter(Boolean).join(' '), people: [keep, remove] as [MergeablePerson, MergeablePerson] }]
    })
    .sort((x, y) => x.key.localeCompare(y.key))
    .map(({ name, people }) => ({ name, people }))
}
