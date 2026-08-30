/**
 * Requests to administer a club (#474).
 *
 * Anyone holding an affiliation number can ask, from a public page, without an
 * account — which they could not otherwise obtain, since sign-in is passwordless
 * and only sends a code to an address that already exists. A general admin then
 * approves or refuses.
 *
 * What this module holds is the judgement aid, not the judgement: how close a
 * requester's address is to the one FFTT publishes for that club, and how much
 * of that published address a public page may show. The decision stays human,
 * deliberately — the correspondent is never written to, so nothing here proves
 * anything, it only tells a general admin where to look.
 *
 * Structurally typed like the other `@shared/lib` modules, for the same reason
 * (see clubAdmins.ts).
 */

/**
 * Where a request has got to (#474).
 *
 *   pending_club  → waiting on the club's correspondent to confirm
 *   pending_admin → confirmed (or unconfirmable), waiting on a general admin
 *   approved / rejected → decided, and kept as a record
 *
 * The club step is a courtesy and a filter, never a proof: the address it is
 * sent to comes from the requester's browser, so it can be forged. What closes
 * that is the general admin's live re-read at the last step — see the
 * migration 0043 header.
 */
export type ClubAdminRequestStatus = 'pending_club' | 'pending_admin' | 'approved' | 'rejected'

/**
 * Decided, and therefore done with. Deliberately the *only* closed set: a
 * request is finished when it says so, and anything else is still live.
 *
 * The inverse — listing the live states and calling the rest done — is what a
 * stale client does badly. A page built before `pending_admin` existed filed
 * every confirmed request under "traitées", blank-badged and with no way to act
 * on it: work vanished from the queue of the one person who had to do it. This
 * way an unrecognised status errs towards the human instead of away from them.
 */
export const isDecidedRequest = (s: string): boolean => s === 'approved' || s === 'rejected'

/** Still in flight — including a status this build has never heard of. */
export const isLiveRequest = (s: string): boolean => !isDecidedRequest(s)

/**
 * What the requester's browser read from FFTT at the moment they asked.
 *
 * Stored because the server cannot fetch it: FFTT and dafunker block
 * Cloudflare's egress IPs, which is why every FFTT read in this app runs in a
 * browser (#229/#231/#247). It follows that this is **claimant-supplied data**
 * and carries no more authority than the rest of the form — the review screen
 * re-reads FFTT in the general admin's own browser and compares, rather than
 * trusting what is stored here.
 */
export interface ClubAdminRequestSnapshot {
  displayName: string
  venue: string
  correspondentName: string
  correspondentEmail: string
  correspondentPhone: string
}

export interface ClubAdminRequest {
  id: string
  affiliationNumber: string
  /** The club, once it exists; absent while the request names one we do not have. */
  clubId?: string
  email: string
  firstName: string
  lastName: string
  phone: string
  /** What the requester says they are in the club; free text, may be empty. */
  message: string
  /**
   * The requester's FFTT licence, when they gave one. Optional, and the reason
   * it is worth asking: with it, approving creates them as the licensee they
   * already are rather than as a second person the player import then
   * duplicates.
   */
  licenseNumber: string
  /**
   * The address the club confirmation was actually sent to — empty when FFTT
   * published none. Recorded separately from the snapshot because the review
   * screen compares it against what FFTT publishes *now*: that comparison is
   * what catches a requester who put their own address in as the club's.
   */
  correspondentEmail: string
  /** When the correspondent confirmed; absent while they have not. */
  clubConfirmedAt?: string
  snapshot: ClubAdminRequestSnapshot
  status: ClubAdminRequestStatus
  /** ISO timestamps. */
  createdAt: string
  decidedAt?: string
  decidedBy?: string
  decisionNote?: string
}

// ---------------------------------------------------------------------------
// Comparing a requester to the published correspondent
// ---------------------------------------------------------------------------

/**
 * How close the requester's address is to the one FFTT publishes.
 *
 * `exact` is the strongest signal available without sending anything. `domain`
 * catches the club that has both `contact@club.fr` and `president@club.fr`.
 * `different` is not suspicious on its own — a correspondent writing from their
 * personal address is entirely ordinary, and is why this is shown rather than
 * enforced. `unknown` means FFTT publishes no address to compare against.
 */
export type EmailMatch = 'exact' | 'domain' | 'different' | 'unknown'

const normalizeEmail = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

const domainOf = (email: string) => {
  const at = email.lastIndexOf('@')
  return at > 0 ? email.slice(at + 1) : ''
}

export function emailMatch(
  requestEmail: string | null | undefined,
  correspondentEmail: string | null | undefined,
): EmailMatch {
  const theirs = normalizeEmail(correspondentEmail)
  const ours = normalizeEmail(requestEmail)
  if (!theirs || !ours) return 'unknown'
  if (theirs === ours) return 'exact'
  const d = domainOf(theirs)
  // A shared free-mail domain says nothing: half of France is on gmail.com.
  if (d && d === domainOf(ours) && !FREE_MAIL_DOMAINS.has(d)) return 'domain'
  return 'different'
}

/**
 * Domains where sharing one proves nothing, because everybody is on them. A
 * club's own domain is the only kind that carries a signal.
 */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr',
  'laposte.net', 'hotmail.fr', 'hotmail.com', 'outlook.fr', 'outlook.com',
  'live.fr', 'yahoo.fr', 'yahoo.com', 'icloud.com', 'me.com', 'bbox.fr', 'numericable.fr',
])

/** French wording for each verdict, for the review screen's badge. */
export const EMAIL_MATCH_LABELS: Record<EmailMatch, string> = {
  exact: 'Adresse identique à celle de la FFTT',
  domain: 'Même domaine que la FFTT',
  different: 'Adresse différente de celle de la FFTT',
  unknown: 'La FFTT ne publie aucune adresse',
}

/**
 * How much weight to give the badge. Only `exact` reads as reassuring; the
 * other three are neutral, because none of them is evidence against the
 * requester — a club secretary writing from a personal address is the norm.
 */
export const EMAIL_MATCH_TONE: Record<EmailMatch, 'strong' | 'neutral'> = {
  exact: 'strong',
  domain: 'neutral',
  different: 'neutral',
  unknown: 'neutral',
}

// ---------------------------------------------------------------------------
// Showing the correspondent on a public page
// ---------------------------------------------------------------------------

/**
 * The published address with its local part hidden: `p•••••@gmail.com`.
 *
 * FFTT publishes this openly, but /rejoindre is a page anyone can load with any
 * affiliation number, and republishing a club's contact address in full to an
 * anonymous visitor is a step further than the app needs to go. Enough survives
 * for a requester to recognise the club they meant — the first letter and the
 * domain — and the general admin sees the whole thing on the review screen.
 *
 * The mask is a fixed five bullets, not one per character: the length of an
 * address is itself a clue worth not handing over.
 */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim()
  if (!value) return ''
  const at = value.lastIndexOf('@')
  if (at <= 0) return '•••••'
  return `${value[0]}•••••${value.slice(at)}`
}

/** The same for a phone: the last two digits are enough to recognise one. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 4) return digits ? '••••' : ''
  return `••••••${digits.slice(-2)}`
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Why a request cannot be submitted as typed. */
export type RequestRefusal =
  | 'invalid_affiliation'
  | 'invalid_email'
  | 'missing_name'
  | 'already_pending'
  | 'already_admin'
  | 'invalid_licence'

export const REQUEST_REFUSAL_MESSAGES: Record<RequestRefusal, string> = {
  invalid_affiliation: "Le numéro d’affiliation n’est pas valide.",
  invalid_email: 'Renseignez une adresse e-mail valide.',
  missing_name: 'Renseignez votre nom et votre prénom.',
  already_pending: 'Une demande est déjà en attente pour ce club avec cette adresse.',
  already_admin: 'Cette adresse administre déjà ce club.',
  invalid_licence: 'Le numéro de licence ne semble pas valide (5 à 8 chiffres).',
}

/**
 * An FFTT affiliation number: 8 digits, as printed on every FFTT document.
 * Checked here so the public endpoint has something to reject before it ever
 * touches the database.
 */
export function isValidAffiliationNumber(value: string | null | undefined): boolean {
  return /^\d{8}$/.test((value ?? '').trim())
}

/** Deliberately permissive: the address is checked by being used, not by a regex. */
export function isPlausibleEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return v.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/** The form’s own check, before the request is sent. */
export function validateRequestForm(form: {
  affiliationNumber: string
  email: string
  firstName: string
  lastName: string
  licenseNumber?: string
}): RequestRefusal | null {
  if (!isValidAffiliationNumber(form.affiliationNumber)) return 'invalid_affiliation'
  if (!form.firstName.trim() || !form.lastName.trim()) return 'missing_name'
  if (!isPlausibleEmail(form.email)) return 'invalid_email'
  if (!isPlausibleLicenceNumber(form.licenseNumber)) return 'invalid_licence'
  return null
}

/** French label of a request’s state, for the review list. */
export const REQUEST_STATUS_LABELS: Record<ClubAdminRequestStatus, string> = {
  pending_club: 'En attente du club',
  pending_admin: 'À traiter',
  approved: 'Approuvée',
  rejected: 'Refusée',
}

/**
 * The label for a status, never empty. An unknown one is shown as itself rather
 * than as an unexplained blank chip — if a build meets a status it predates,
 * saying so is more use than saying nothing.
 */
export function requestStatusLabel(status: string): string {
  return REQUEST_STATUS_LABELS[status as ClubAdminRequestStatus] ?? status
}

export function requestStatusBadge(status: string): string {
  return REQUEST_STATUS_BADGES[status as ClubAdminRequestStatus] ?? 'bg-slate-100 text-slate-600'
}

export const REQUEST_STATUS_BADGES: Record<ClubAdminRequestStatus, string> = {
  pending_club: 'bg-slate-100 text-slate-600',
  pending_admin: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-slate-100 text-slate-600',
}

/**
 * A licence number as FFTT writes it: digits, 5 to 8 of them. Optional on the
 * form, so an empty value is valid — only a malformed one is refused.
 */
export function isPlausibleLicenceNumber(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return v === '' || /^\d{5,8}$/.test(v)
}
