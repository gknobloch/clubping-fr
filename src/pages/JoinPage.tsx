import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import {
  correspondentName,
  fetchClubDetailXmlFromBrowser,
  formatVenue,
  parseClubDetailXml,
  type FfttClubDetail,
} from '@/lib/ffttClub'
import {
  isValidAffiliationNumber,
  maskEmail,
  maskPhone,
  REQUEST_REFUSAL_MESSAGES,
  validateRequestForm,
} from '@/lib/clubAdminRequests'
import { submitClubAdminRequest, type ClubAdminRequestError } from '@/lib/onboardingApi'

/**
 * "Faire administrer mon club" — the public way in (#474).
 *
 * This page exists because the app has no other door for a club it does not
 * know. Sign-in is passwordless and only mails a code to an address that
 * already has a row, so the correspondent of an unknown club cannot log in to
 * ask for anything: without this, the only route in is knowing someone.
 *
 * It runs with no session, which shapes two decisions:
 *
 *   - The FFTT lookup happens **here, in the visitor's browser**, as every FFTT
 *     read in this app does (#229/#231/#247) — the server's IPs are blocked.
 *     What it reads is sent along with the form so a general admin can see what
 *     the requester saw, but it is claimant-supplied and treated as such.
 *   - The correspondent FFTT publishes is shown **masked**. It confirms the
 *     club without republishing a contact address to anyone who can type eight
 *     digits; the general admin sees it whole on the review screen.
 *
 * Submitting writes to the club: the correspondent is e-mailed a confirmation
 * link, and only once they have used it does the request reach a general admin.
 * That address comes from this page's own FFTT read, so it is a filter and a
 * courtesy rather than a proof — see migration 0043.
 */
type Step = 'search' | 'form' | 'sent'
type SearchState = 'idle' | 'loading' | 'not_found' | 'error'

export function JoinPage() {
  const [affiliationNumber, setAffiliationNumber] = useState('')
  const [search, setSearch] = useState<SearchState>('idle')
  const [club, setClub] = useState<FfttClubDetail | null>(null)
  const [step, setStep] = useState<Step>('search')
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', licenseNumber: '', message: '',
  })
  const [clubNotified, setClubNotified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const number = affiliationNumber.trim()

  const handleSearch = async () => {
    setError(null)
    if (!isValidAffiliationNumber(number)) {
      setError(REQUEST_REFUSAL_MESSAGES.invalid_affiliation)
      return
    }
    setSearch('loading')
    setClub(null)
    const xml = await fetchClubDetailXmlFromBrowser(number)
    if (xml === null) {
      setSearch('error')
      return
    }
    const parsed = parseClubDetailXml(xml)
    if (!parsed) {
      setSearch('not_found')
      return
    }
    setClub(parsed)
    setSearch('idle')
    setStep('form')
  }

  const handleSubmit = async () => {
    if (!club) return
    const invalid = validateRequestForm({ ...form, affiliationNumber: number })
    if (invalid) {
      setError(REQUEST_REFUSAL_MESSAGES[invalid])
      return
    }
    setSending(true)
    setError(null)
    try {
      const result = await submitClubAdminRequest({
        affiliationNumber: number,
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        licenseNumber: form.licenseNumber.trim(),
        message: form.message.trim(),
        // What this browser read from FFTT, so the reviewer sees the same
        // record the requester was looking at.
        snapshot: {
          displayName: club.displayName,
          venue: formatVenue({
            label: club.venueLabel,
            street: club.street,
            postalCode: club.postalCode,
            city: club.city,
          }) ?? '',
          correspondentName: correspondentName(club.correspondent),
          correspondentEmail: club.correspondent?.email ?? '',
          correspondentPhone: club.correspondent?.phone ?? '',
        },
      })
      setClubNotified(Boolean(result.clubNotified))
      setStep('sent')
    } catch (e) {
      const err = e as ClubAdminRequestError
      setError(err.message || "La demande n'a pas pu être envoyée. Réessayez plus tard.")
    } finally {
      setSending(false)
    }
  }

  return (
    <JoinLayout>
      {step === 'sent' ? (
        <Sent club={club} clubNotified={clubNotified} />
      ) : step === 'form' && club ? (
        <RequestForm
          club={club}
          form={form}
          setForm={setForm}
          error={error}
          sending={sending}
          onBack={() => {
            setStep('search')
            setError(null)
          }}
          onSubmit={handleSubmit}
        />
      ) : (
        <ClubSearch
          value={affiliationNumber}
          onChange={(v) => {
            setAffiliationNumber(v)
            setSearch('idle')
            setError(null)
          }}
          state={search}
          error={error}
          onSearch={handleSearch}
        />
      )}
    </JoinLayout>
  )
}

/** The same furniture as the sign-in screen — this is the other way in. */
function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/[0.07] blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
            <BrandMark className="h-14 w-14 text-slate-800" title="Club Ping" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-slate-800">
            Faire administrer mon club
          </h1>
          <p className="mt-2 max-w-sm text-balance text-sm text-slate-600">
            Votre club n’est pas encore sur Club Ping, ou personne ne l’administre&nbsp;? Demandez
            à en devenir administrateur.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link className="underline hover:text-slate-600" to="/login">
            Retour à la connexion
          </Link>
          {' · '}
          <Link className="underline hover:text-slate-600" to="/confidentialite">
            Politique de confidentialité
          </Link>
        </p>
      </div>
    </div>
  )
}

const inputClass =
  'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  )
}

function ClubSearch({
  value,
  onChange,
  state,
  error,
  onSearch,
}: {
  value: string
  onChange: (v: string) => void
  state: SearchState
  error: string | null
  onSearch: () => void
}) {
  return (
    <div>
      <label htmlFor="join-affiliation" className="block text-sm font-medium text-slate-700">
        Numéro d’affiliation du club
      </label>
      <p className="mt-1 text-xs text-slate-500">
        Huit chiffres, tels qu’ils figurent sur vos documents FFTT — par exemple 06680011.
      </p>
      <input
        id="join-affiliation"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch()
        }}
        className={inputClass}
      />

      {error && <Alert>{error}</Alert>}
      {state === 'not_found' && (
        <Alert>Aucun club ne porte ce numéro à la FFTT. Vérifiez-le et réessayez.</Alert>
      )}
      {state === 'error' && (
        <Alert>
          La FFTT n’a pas répondu. Réessayez dans un instant — si cela persiste, ce n’est pas de
          votre fait.
        </Alert>
      )}

      <button
        type="button"
        onClick={onSearch}
        disabled={state === 'loading'}
        className={`mt-4 w-full ${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
      >
        {state === 'loading' ? 'Recherche…' : 'Rechercher ce club'}
      </button>
    </div>
  )
}

/** The FFTT record, shown back so both sides agree which club is meant. */
function ClubCard({ club }: { club: FfttClubDetail }) {
  const venue = formatVenue({
    label: club.venueLabel,
    street: club.street,
    postalCode: club.postalCode,
    city: club.city,
  })
  const contact = correspondentName(club.correspondent)
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="font-medium text-slate-800">{club.displayName}</p>
      <p className="text-xs text-slate-500">N° {club.affiliationNumber}</p>
      {venue && <p className="mt-1 text-sm text-slate-600">{venue}</p>}
      {(contact || club.correspondent?.email) && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contact publié par la FFTT
          </p>
          <p className="text-sm text-slate-700">{contact || 'Nom non publié'}</p>
          {/* Masked: this page is public. The reviewing admin sees it in full. */}
          <p className="text-xs text-slate-500">
            {[maskEmail(club.correspondent?.email), maskPhone(club.correspondent?.phone)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}

function RequestForm({
  club,
  form,
  setForm,
  error,
  sending,
  onBack,
  onSubmit,
}: {
  club: FfttClubDetail
  form: {
    firstName: string
    lastName: string
    email: string
    phone: string
    licenseNumber: string
    message: string
  }
  setForm: React.Dispatch<React.SetStateAction<typeof form>>
  error: string | null
  sending: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div>
      <ClubCard club={club} />
      <button
        type="button"
        onClick={onBack}
        className={`mt-2 text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
      >
        Ce n’est pas mon club
      </button>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="join-firstName" className="block text-sm font-medium text-slate-700">
              Prénom
            </label>
            <input id="join-firstName" type="text" value={form.firstName} onChange={set('firstName')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="join-lastName" className="block text-sm font-medium text-slate-700">
              Nom
            </label>
            <input id="join-lastName" type="text" value={form.lastName} onChange={set('lastName')} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="join-email" className="block text-sm font-medium text-slate-700">
            Adresse e-mail
          </label>
          <input id="join-email" type="email" value={form.email} onChange={set('email')} className={inputClass} />
          <p className="mt-1 text-xs text-slate-500">
            C’est avec cette adresse que vous vous connecterez si la demande est acceptée.
          </p>
        </div>
        <div>
          <label htmlFor="join-phone" className="block text-sm font-medium text-slate-700">
            Téléphone (facultatif)
          </label>
          <input id="join-phone" type="tel" value={form.phone} onChange={set('phone')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="join-licenseNumber" className="block text-sm font-medium text-slate-700">
            Numéro de licence (facultatif)
          </label>
          <input
            id="join-licenseNumber"
            type="text"
            inputMode="numeric"
            value={form.licenseNumber}
            onChange={set('licenseNumber')}
            className={inputClass}
          />
          {/* Not a formality: without it an approved licensee is created as a
              second person, and importing the club's players then duplicates
              them (#474). */}
          <p className="mt-1 text-xs text-slate-500">
            Si vous êtes licencié dans ce club, indiquez-le : votre compte sera rattaché à votre
            licence au lieu d’en créer une seconde fiche.
          </p>
        </div>
        <div>
          <label htmlFor="join-message" className="block text-sm font-medium text-slate-700">
            Votre rôle dans le club (facultatif)
          </label>
          <textarea
            id="join-message"
            rows={3}
            value={form.message}
            onChange={set('message')}
            placeholder="Par exemple : je suis le correspondant du club, ou le secrétaire."
            className={`${inputClass} min-h-[88px]`}
          />
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onBack} className={NEUTRAL_BUTTON_CLASS}>
          Retour
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={sending}
          className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
        >
          {sending ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </div>
    </div>
  )
}

/**
 * The end of the flow, and it is honest about being a dead end: nothing is
 * e-mailed, to the club or to the requester (#474), so the only truthful thing
 * to say is that a human will look and that they will hear back another way.
 */
function Sent({ club, clubNotified }: { club: FfttClubDetail | null; clubNotified: boolean }) {
  return (
    <div className="text-center">
      <p className="font-display text-lg font-semibold text-slate-800">Demande envoyée</p>
      <p className="mt-2 text-sm text-slate-600">
        Votre demande {club ? `pour ${club.displayName} ` : ''}a bien été enregistrée.
      </p>
      {/* Says which of the two paths it took, because the waiting is different:
          one depends on a club reading its mail, the other does not. */}
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm text-slate-600">
        {clubNotified ? (
          <>
            <p>
              Un message vient d’être envoyé au correspondant que la FFTT publie pour ce club. Dès
              qu’il aura confirmé, un administrateur de Club Ping examinera la demande.
            </p>
            <p className="mt-2">
              Si vous êtes vous-même ce correspondant, le message est dans votre boîte.
            </p>
          </>
        ) : (
          <p>
            La FFTT ne publie aucune adresse de contact pour ce club : la demande part directement
            à un administrateur de Club Ping.
          </p>
        )}
        <p className="mt-2">Vous serez prévenu par e-mail de la décision.</p>
      </div>
      <Link
        to="/login"
        className={`mt-5 inline-flex text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
      >
        Aller à la connexion
      </Link>
    </div>
  )
}
