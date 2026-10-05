// Several profiles behind one e-mail address (#640): a parent and a child who
// share the parent's address sign in once and switch between the two. What is
// shared by the web, the app and the API lives here, without React, D1 or a
// network in the way.
import type { Profile } from '../types'

export interface ProfileClub {
  /** Absent for a profile in no club — a general administrator, typically. */
  clubId?: string
  clubName: string
  profiles: Profile[]
}

const NO_CLUB = 'Sans club'

const fullName = (p: Profile) => [p.firstName, p.lastName].filter(Boolean).join(' ')

/** "Sacha Henaut", or the role when the row carries no name at all. */
export function profileName(p: Profile): string {
  return fullName(p) || (p.role === 'general_admin' ? 'Administrateur' : 'Membre sans nom')
}

/**
 * The switcher's sections: one per club, clubs by name, profiles by first
 * name inside each, and the profiles with no club last.
 *
 * By club and not as one list, because a club is what tells two profiles of a
 * family apart at a glance once there are more than two — and a parent who
 * administers one club while the children play in another reads the
 * difference first.
 */
export function profilesByClub(profiles: Profile[]): ProfileClub[] {
  const byClub = new Map<string, ProfileClub>()
  for (const p of profiles) {
    const key = p.clubId ?? ''
    const club = byClub.get(key) ?? {
      ...(p.clubId ? { clubId: p.clubId } : {}),
      clubName: p.clubId ? (p.clubName || p.clubId) : NO_CLUB,
      profiles: [],
    }
    club.profiles.push(p)
    byClub.set(key, club)
  }
  const clubs = [...byClub.values()]
  for (const c of clubs) {
    c.profiles.sort((a, b) =>
      (a.firstName ?? '').localeCompare(b.firstName ?? '', 'fr') ||
      (a.lastName ?? '').localeCompare(b.lastName ?? '', 'fr'))
  }
  return clubs.sort((a, b) =>
    Number(!a.clubId) - Number(!b.clubId) || a.clubName.localeCompare(b.clubName, 'fr'))
}

/**
 * Whether a switcher has anything to offer: another profile than the one
 * signed in. One profile is not a choice, and the entry is not drawn.
 */
export function hasOtherProfiles(profiles: Profile[] | undefined, currentId: string | undefined): boolean {
  return !!profiles?.some((p) => p.id !== currentId)
}
