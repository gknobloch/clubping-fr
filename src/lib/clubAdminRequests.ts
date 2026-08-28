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

export type ClubAdminRequestStatus = 'pending' | 'approved' | 'rejected'

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

export const REQUEST_REFUSAL_MESSAGES: Record<RequestRefusal, string> = {
  invalid_affiliation: "Le numéro d’affiliation n’est pas valide.",
  invalid_email: 'Renseignez une adresse e-mail valide.',
  missing_name: 'Renseignez votre nom et votre prénom.',
  already_pending: 'Une demande est déjà en attente pour ce club avec cette adresse.',
  already_admin: 'Cette adresse administre déjà ce club.',
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
}): RequestRefusal | null {
  if (!isValidAffiliationNumber(form.affiliationNumber)) return 'invalid_affiliation'
  if (!form.firstName.trim() || !form.lastName.trim()) return 'missing_name'
  if (!isPlausibleEmail(form.email)) return 'invalid_email'
  return null
}

/** French label of a request’s state, for the review list. */
export const REQUEST_STATUS_LABELS: Record<ClubAdminRequestStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Refusée',
}

export const REQUEST_STATUS_BADGES: Record<ClubAdminRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-slate-100 text-slate-600',
}
