import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { PRIMARY_BUTTON_CLASS } from '@/components/Button'
import {
  confirmClubAdminRequest,
  fetchConfirmableRequest,
  type ClubAdminRequestError,
  type ConfirmableRequest,
} from '@/lib/onboardingApi'

/**
 * The club's step (#474) — the one screen a correspondent ever sees.
 *
 * They reach it from a link e-mailed to the address FFTT publishes for their
 * club, and they have no account: the token in the URL is the whole of their
 * authorisation, which is why the endpoints behind it are public and read
 * exactly one request.
 *
 * Confirming does not grant anything. It moves the request into a general
 * admin's queue, and the page says so plainly — a club that believes it has
 * just handed over the keys will rightly hesitate to click.
 *
 * There is deliberately no "refuse" button. Doing nothing already refuses:
 * the request expires unconfirmed and never reaches the queue. A button would
 * add a way to act on a link that arrived out of nowhere, and nothing would be
 * gained by it.
 */
type State = 'loading' | 'ready' | 'invalid' | 'confirmed' | 'error'

export function ConfirmRequestPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>('loading')
  const [request, setRequest] = useState<ConfirmableRequest | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setState('invalid')
      return
    }
    fetchConfirmableRequest(token)
      .then((r) => {
        if (cancelled) return
        setRequest(r)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('invalid')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const confirm = async () => {
    setBusy(true)
    try {
      await confirmClubAdminRequest(token)
      setState('confirmed')
    } catch (e) {
      // A link used twice lands here, and "already confirmed" is not a failure
      // worth alarming a club about.
      setState((e as ClubAdminRequestError).status === 404 ? 'invalid' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmLayout>
      {state === 'loading' && <p className="text-sm text-slate-500">Chargement…</p>}

      {state === 'invalid' && (
        <div>
          <p className="font-display text-lg font-semibold text-slate-800">Lien expiré</p>
          <p className="mt-2 text-sm text-slate-600">
            Ce lien n’est plus valable. Il a peut-être déjà été utilisé, ou la demande a expiré
            (les liens sont valables 7 jours).
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Si la demande vous paraît légitime, demandez à la personne concernée d’en déposer une
            nouvelle.
          </p>
        </div>
      )}

      {state === 'error' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          La confirmation n’a pas pu être enregistrée. Réessayez dans un instant.
        </p>
      )}

      {state === 'confirmed' && request && (
        <div>
          <p className="font-display text-lg font-semibold text-slate-800">Merci</p>
          <p className="mt-2 text-sm text-slate-600">
            Votre confirmation est enregistrée. La demande de {request.firstName}{' '}
            {request.lastName} va maintenant être examinée par un administrateur de Club Ping, qui
            vous préviendra tous les deux de sa décision.
          </p>
        </div>
      )}

      {state === 'ready' && request && (
        <div>
          <p className="text-sm text-slate-600">
            La FFTT vous indique comme correspondant du club
          </p>
          <p className="font-display text-lg font-semibold text-slate-800">{request.clubName}</p>
          <p className="text-xs text-slate-500">N° {request.affiliationNumber}</p>

          <p className="mt-4 text-sm text-slate-600">
            Cette personne demande à administrer votre club sur Club Ping&nbsp;:
          </p>
          <dl className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <Row label="Nom">
              {request.firstName} {request.lastName}
            </Row>
            <Row label="E-mail">{request.email}</Row>
            {request.phone && <Row label="Téléphone">{request.phone}</Row>}
            {request.licenseNumber && <Row label="Licence">{request.licenseNumber}</Row>}
          </dl>
          {request.message && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">
              « {request.message} »
            </p>
          )}

          {/* What confirming does, and what it does not. */}
          <p className="mt-4 text-sm text-slate-600">
            Si vous reconnaissez cette personne, confirmez sa demande. Elle sera ensuite examinée
            par un administrateur de Club Ping&nbsp;: votre confirmation ne lui donne pas encore
            accès à votre club.
          </p>

          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`mt-4 w-full ${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {busy ? 'Envoi…' : 'Je confirme cette demande'}
          </button>

          {/* Inaction is the refusal, so it needs saying rather than a button. */}
          <p className="mt-3 text-xs text-slate-500">
            Vous ne reconnaissez pas cette personne&nbsp;? N’en faites rien : sans votre
            confirmation, la demande n’ira pas plus loin.
          </p>
        </div>
      )}
    </ConfirmLayout>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-slate-500">{label}&nbsp;:</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800">{children}</dd>
    </div>
  )
}

function ConfirmLayout({ children }: { children: React.ReactNode }) {
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
            Confirmer une demande
          </h1>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link className="underline hover:text-slate-600" to="/confidentialite">
            Politique de confidentialité
          </Link>
        </p>
      </div>
    </div>
  )
}
