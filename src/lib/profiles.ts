// Several profiles behind one e-mail address (#640): a parent and a child who
// share the parent's address sign in once and switch between the two. What is
// shared by the web, the app and the API lives here, without React, D1 or a
// network in the way.
import type { Profile } from '../types'

const NO_CLUB = 'Sans club'
export const GENERAL_ADMINISTRATION = 'Administration générale'

const fullName = (p: Profile) => [p.firstName, p.lastName].filter(Boolean).join(' ')

/** "Sacha Henaut", or the role when the row carries no name at all. */
export function profileName(p: Profile): string {
  return fullName(p) || (p.role === 'general_admin' ? 'Administrateur' : 'Membre sans nom')
}

/**
 * Where a profile is: its club, « Administration générale » for a general
 * admin — a role of the person across every club (#655), never « Sans club »
 * — and the club's id for one the server could not name.
 */
export function profileClubName(p: Profile): string {
  if (p.role === 'general_admin') return GENERAL_ADMINISTRATION
  return p.clubId ? (p.clubName || p.clubId) : NO_CLUB
}

export interface ProfileSections {
  /** The person's own profiles, one per club: « Mes clubs ». */
  own: Profile[]
  /** Other people's, delegated to whoever signed in: « Profils que vous gérez ». */
  managed: Profile[]
}

/**
 * The switcher's two lists (#749). The person's own profiles differ only by
 * their club — same name, same photo — so a row of « Mes clubs » is the club;
 * a delegated profile is somebody else, so its row is that person. Mixing the
 * two under club headings is what made the old switcher hard to read: « Nathan
 * Thomas » twice, and Chloé's profile looking like one of Nathan's clubs.
 *
 * Own: clubs by name, then the general administration, then a profile in no
 * club. Managed: by name.
 */
export function profileSections(profiles: Profile[]): ProfileSections {
  const rank = (p: Profile) => (p.role === 'general_admin' ? 1 : p.clubId ? 0 : 2)
  const own = profiles.filter((p) => !p.managed).sort((a, b) =>
    rank(a) - rank(b) || profileClubName(a).localeCompare(profileClubName(b), 'fr'))
  const managed = profiles.filter((p) => p.managed).sort((a, b) =>
    profileName(a).localeCompare(profileName(b), 'fr') ||
    profileClubName(a).localeCompare(profileClubName(b), 'fr'))
  return { own, managed }
}

/**
 * When the session is a delegated profile (#749): whose it is, and where
 * « Revenir à mon profil » leads — the profile that signed in (#702), or any
 * of the person's own if a server did not say which. Null on one's own.
 */
export function managedSession(
  profiles: Profile[] | undefined,
  currentId: string | undefined,
): { current: Profile; home?: Profile } | null {
  const current = profiles?.find((p) => p.id === currentId)
  if (!profiles || !current?.managed) return null
  const home = profiles.find((p) => p.signedIn && !p.managed) ?? profiles.find((p) => !p.managed)
  return { current, ...(home ? { home } : {}) }
}

/**
 * Whether a switcher has anything to offer: another profile than the one
 * signed in. One profile is not a choice, and the entry is not drawn.
 */
export function hasOtherProfiles(profiles: Profile[] | undefined, currentId: string | undefined): boolean {
  return !!profiles?.some((p) => p.id !== currentId)
}
