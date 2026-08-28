/**
 * Who administers a club, and how many (#474).
 *
 * A club admin is not a separate entity: it is `users.role = 'club_admin'`
 * paired with `users.club_id`. The projection that feeds the app's player
 * lists filters on `is_player`, not on `role`, so promoting a player leaves
 * them a player — same roster, same availabilities, same licence. That is why
 * there is no join table here and no `admin_ids` on the club: the answer to
 * "who administers this club" is a query over the members themselves.
 *
 * Two counts bound the set, and they pull in opposite directions:
 *
 *   - **At most 5.** Beyond that "admin" stops meaning anything, and every one
 *     of them can edit the club, its teams and everyone's availabilities.
 *   - **Never zero, once there is one.** A club whose last admin steps down is
 *     administered by nobody and cannot appoint a replacement from the inside —
 *     it needs a general admin to notice and intervene. Refusing the last
 *     removal is cheaper than that rescue.
 *
 * Structurally typed rather than importing `Role`/`User`: this file is one of
 * the `@shared/lib` modules the mobile app compiles from ../src, where `@/`
 * resolves somewhere else entirely.
 */

/** The most admins a single club may have at once. */
export const MAX_CLUB_ADMINS = 5

/** The shape this module needs of a member — a user row or a player alike. */
export interface AdminCandidate {
  id: string
  role?: string
  clubId?: string
  status?: string
}

/** Whether a member currently administers the given club. */
export function isClubAdminOf(user: AdminCandidate, clubId: string): boolean {
  return user.role === 'club_admin' && user.clubId === clubId
}

/**
 * The club's admins, in the order they should be listed. Sorting is left to
 * the caller, which has the display names this module deliberately does not.
 */
export function clubAdminsOf<T extends AdminCandidate>(users: T[], clubId: string): T[] {
  return users.filter((u) => isClubAdminOf(u, clubId))
}

/**
 * The member doing the appointing. A viewer is a member like any other, so
 * this is `AdminCandidate` with nothing required: callers pass whole user rows,
 * and only `role` and `clubId` are ever read.
 */
export type AdminViewer = Partial<AdminCandidate> | null | undefined

/** Why a member may not be made an admin of this club. */
export type AddRefusal =
  | 'not_allowed'
  | 'full'
  | 'already_admin'
  | 'general_admin'
  | 'other_club'
  | 'archived'
  | 'email_taken'

/** Why an admin may not be stood down. */
export type RemoveRefusal = 'not_allowed' | 'not_an_admin' | 'last_admin'

export type Refusal = AddRefusal | RemoveRefusal

/** A decision, carrying the reason when it is no. */
export type Decision<R> = { ok: true } | { ok: false; reason: R }

const no = <R>(reason: R): Decision<R> => ({ ok: false, reason })
const yes = { ok: true } as const

/**
 * Who may appoint and stand down a club's admins: a general admin anywhere, a
 * club admin only in their own club. A captain has authority over a team, not
 * over the club, and a player none at all.
 */
export function canManageClubAdmins(viewer: AdminViewer, clubId: string): boolean {
  if (!viewer) return false
  if (viewer.role === 'general_admin') return true
  return viewer.role === 'club_admin' && viewer.clubId === clubId
}

/**
 * Whether `candidate` can become an admin of `clubId`, as judged by `viewer`.
 *
 * `candidate` is an existing member; the "invite someone by e-mail" path
 * creates the member first and then asks this of the fresh row, so both routes
 * meet the same rules. The `email_taken` refusal is the one this cannot decide
 * — uniqueness lives in the database — and it is declared here only so callers
 * have a single vocabulary for the failure.
 */
export function canAddClubAdmin(
  users: AdminCandidate[],
  clubId: string,
  candidate: AdminCandidate,
  viewer: AdminViewer,
): Decision<AddRefusal> {
  if (!canManageClubAdmins(viewer, clubId)) return no('not_allowed')
  if (isClubAdminOf(candidate, clubId)) return no('already_admin')
  // Demoting a general admin to run one club would cost them every other one.
  if (candidate.role === 'general_admin') return no('general_admin')
  // A member belongs to one club. Appointing someone from elsewhere would move
  // them, taking their licence, roster and availabilities to a club they do not
  // play for — so it is a refusal, not a silent transfer.
  if (candidate.clubId && candidate.clubId !== clubId) return no('other_club')
  if (candidate.status === 'archived') return no('archived')
  if (clubAdminsOf(users, clubId).length >= MAX_CLUB_ADMINS) return no('full')
  return yes
}

/**
 * Whether the given admin can be stood down, as judged by `viewer`.
 *
 * Self-removal is allowed and deliberately not special-cased: an admin leaving
 * the club is ordinary, and the last-admin rule already catches the one case
 * that matters — the club being left with nobody. It applies to a general
 * admin's removal too, who would otherwise strand a club they cannot see is
 * now empty.
 */
export function canRemoveClubAdmin(
  users: AdminCandidate[],
  clubId: string,
  userId: string,
  viewer: AdminViewer,
): Decision<RemoveRefusal> {
  if (!canManageClubAdmins(viewer, clubId)) return no('not_allowed')
  const admins = clubAdminsOf(users, clubId)
  if (!admins.some((a) => a.id === userId)) return no('not_an_admin')
  if (admins.length <= 1) return no('last_admin')
  return yes
}

/** How many more admins the club may take on — 0 when it is full. */
export function remainingClubAdminSlots(users: AdminCandidate[], clubId: string): number {
  return Math.max(0, MAX_CLUB_ADMINS - clubAdminsOf(users, clubId).length)
}

/**
 * French wording for a refusal, shared by both club screens and by the API's
 * error responses so a member is told the same thing wherever they hit it.
 */
export const REFUSAL_MESSAGES: Record<Refusal, string> = {
  not_allowed: "Vous n’administrez pas ce club.",
  full: `Ce club a déjà ${MAX_CLUB_ADMINS} administrateurs, le maximum. Retirez-en un pour en ajouter un autre.`,
  already_admin: 'Cette personne administre déjà ce club.',
  general_admin: "Cette personne est administrateur général : elle administre déjà tous les clubs.",
  other_club: "Cette personne est membre d’un autre club.",
  archived: "Cette personne est archivée. Réactivez-la d’abord.",
  email_taken: 'Cette adresse est déjà utilisée par un autre membre.',
  not_an_admin: "Cette personne n’administre pas ce club.",
  last_admin:
    "C’est le dernier administrateur du club. Désignez-en un autre avant de le retirer, sans quoi plus personne ne pourrait administrer le club.",
}

/** The message for a decision that went against, for direct display. */
export function refusalMessage(reason: Refusal): string {
  return REFUSAL_MESSAGES[reason]
}
