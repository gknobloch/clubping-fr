import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { PageHeader } from '@/components/PageHeader'
import { ModalShell } from '@/components/ModalShell'
import {
  NEUTRAL_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  SecondaryButton,
  TEXT_TARGET_CLASS,
} from '@/components/Button'
import {
  EMAIL_MATCH_LABELS,
  EMAIL_MATCH_TONE,
  REQUEST_STATUS_BADGES,
  REQUEST_STATUS_LABELS,
  emailMatch,
  type ClubAdminRequest,
} from '@/lib/clubAdminRequests'
import {
  correspondentName,
  fetchClubDetailXmlFromBrowser,
  formatVenue,
  parseClubDetailXml,
  type FfttClubDetail,
} from '@/lib/ffttClub'
import { decideClubAdminRequest, fetchClubAdminRequests } from '@/lib/onboardingApi'

/**
 * "Demandes d'accès" — where a general admin decides who administers a club
 * (#474).
 *
 * The central move here is the **live re-read**. Each request carries a
 * snapshot of what FFTT said when it was submitted, but that snapshot came from
 * the requester's own browser and is worth exactly as much as the rest of their
 * form. So the screen offers to fetch the club's record again, from *this*
 * browser, and shows the two side by side — because the server cannot do the
 * fetch itself (FFTT blocks Cloudflare's egress IPs, #229/#231/#247), the
 * reviewer's browser is the only trustworthy reader available.
 *
 * The address comparison is shown, never enforced. A correspondent writing from
 * a personal address is the ordinary case; only an exact match reads as
 * reassuring, and the rest are stated flatly so they do not look like verdicts.
 */
export function RequestsPage() {
  const { user, token } = useAuth()
  const { clubs } = useAppData()
  const [requests, setRequests] = useState<ClubAdminRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDecided, setShowDecided] = useState(false)
  const [deciding, setDeciding] = useState<ClubAdminRequest | null>(null)

  // Bearer for the mobile-style session, nothing for the web's cookie (#370),
  // which travels on its own.
  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {}
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }, [token])

  const load = useCallback(async () => {
    try {
      const loaded = await fetchClubAdminRequests(headers)
      setRequests(loaded.requests)
      setError(null)
    } catch {
      setRequests([])
      setError('Les demandes n’ont pas pu être chargées.')
    }
  }, [headers])

  useEffect(() => {
    void load()
  }, [load])

  // Two live states now (#474): waiting on the club, and waiting on you. Only
  // the second is yours to act on, so it leads.
  const toDecide = (requests ?? []).filter((r) => r.status === 'pending_admin')
  const awaitingClub = (requests ?? []).filter((r) => r.status === 'pending_club')
  const decided = (requests ?? []).filter((r) => r.status === 'approved' || r.status === 'rejected')
  const shown = showDecided ? decided : [...toDecide, ...awaitingClub]

  if (user && user.role !== 'general_admin') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-600">Cette page est réservée aux administrateurs généraux.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Demandes d’accès" />

      <p className="text-sm text-slate-600">
        Des personnes demandent à administrer un club depuis la page publique. Vérifiez la demande
        auprès de la FFTT avant de l’accepter — aucun message ne leur est envoyé, ni maintenant ni
        après votre décision.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {decided.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showDecided}
            onChange={(e) => setShowDecided(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les demandes traitées ({decided.length})
          </span>
        </label>
      )}

      {requests === null ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-600">
            {showDecided ? 'Aucune demande traitée.' : 'Aucune demande en attente.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {shown.map((request) => (
            <li key={request.id}>
              <RequestCard
                request={request}
                clubName={clubs.find((c) => c.id === request.clubId)?.displayName}
                onDecide={() => setDeciding(request)}
              />
            </li>
          ))}
        </ul>
      )}

      {deciding && (
        <DecideDialog
          request={deciding}
          headers={headers}
          onClose={() => setDeciding(null)}
          onDone={async () => {
            setDeciding(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  )
}

function RequestCard({
  request,
  clubName,
  onDecide,
}: {
  request: ClubAdminRequest
  clubName?: string
  onDecide: () => void
}) {
  const isPending = request.status === 'pending_admin'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-slate-800">
            {request.firstName} {request.lastName}
          </p>
          <p className="text-sm text-slate-600">{request.email}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${REQUEST_STATUS_BADGES[request.status]}`}
        >
          {REQUEST_STATUS_LABELS[request.status]}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Club demandé">
          {clubName ? (
            <>
              <Link
                to={`/clubs/${encodeURIComponent(request.clubId!)}`}
                className="font-medium text-accent-600 hover:text-accent-800"
              >
                {clubName}
              </Link>{' '}
              <span className="text-slate-500">— déjà dans l’application</span>
            </>
          ) : (
            <>
              {request.snapshot.displayName || 'Nom inconnu'}{' '}
              <span className="text-slate-500">— club à créer</span>
            </>
          )}
          <span className="block text-xs text-slate-500">N° {request.affiliationNumber}</span>
        </Field>
        {request.phone && <Field label="Téléphone">{request.phone}</Field>}
        {request.licenseNumber && (
          <Field label="Licence">
            {request.licenseNumber}
            <span className="block text-xs text-slate-500">
              Sera rattachée au licencié plutôt que créer une seconde fiche.
            </span>
          </Field>
        )}
        <Field label="Demandée le">
          {new Date(request.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Field>
      </dl>

      {request.message && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ce qu’elle dit être
          </p>
          <p className="text-sm text-slate-700">{request.message}</p>
        </div>
      )}

      {/* What the requester's own browser read, and nothing more.
          
          There is deliberately no match badge here. Comparing the requester's
          address against a correspondent *they submitted* is not a check: it
          asks whether their form agrees with itself, and anyone filling both
          fields alike earns a reassuring green badge for it. The verdict is only
          meaningful against a live reading of FFTT, so it lives in the decision
          dialog, after the re-check, and nowhere else. */}
      <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Contact FFTT, tel que déclaré par le demandeur
        </p>
        <p className="text-sm text-slate-800">
          {request.snapshot.correspondentName || 'Non renseigné'}
        </p>
        <p className="text-sm text-slate-600">
          {[request.snapshot.correspondentEmail, request.snapshot.correspondentPhone]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Déclaratif : à confronter à la FFTT avant toute décision.
        </p>
      </div>

      {/* Where the club step got to. The address matters as much as the fact:
          the confirmation went to whatever the requester's browser reported, so
          "confirmée" means "someone at that address clicked", not "the club
          agreed" — the live re-check below is what ties the two together. */}
      <p className="mt-3 text-sm">
        {request.status === 'pending_club' ? (
          <span className="text-slate-600">
            En attente de la confirmation du club, envoyée à{' '}
            <span className="font-medium">{request.correspondentEmail}</span>.
          </span>
        ) : request.clubConfirmedAt ? (
          <span className="text-slate-600">
            Confirmée par le club depuis{' '}
            <span className="font-medium">{request.correspondentEmail}</span> le{' '}
            {new Date(request.clubConfirmedAt).toLocaleDateString('fr-FR')}.
          </span>
        ) : (
          <span className="text-amber-700">
            La FFTT ne publiait aucune adresse pour ce club : la demande n’a pas pu être confirmée
            par le club.
          </span>
        )}
      </p>

      {(request.status === 'approved' || request.status === 'rejected') && request.decisionNote && (
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-medium">Motif :</span> {request.decisionNote}
        </p>
      )}

      {isPending && (
        <div className="mt-4">
          <SecondaryButton onClick={onDecide}>Vérifier et décider</SecondaryButton>
        </div>
      )}
    </div>
  )
}

type CheckState = 'idle' | 'loading' | 'done' | 'not_found' | 'error'

/**
 * The decision, taken against a fresh reading of FFTT rather than against the
 * requester's word for it.
 */
function DecideDialog({
  request,
  headers,
  onClose,
  onDone,
}: {
  request: ClubAdminRequest
  headers: HeadersInit
  onClose: () => void
  onDone: () => void
}) {
  const [check, setCheck] = useState<CheckState>('idle')
  const [live, setLive] = useState<FfttClubDetail | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verify = async () => {
    setCheck('loading')
    setError(null)
    const xml = await fetchClubDetailXmlFromBrowser(request.affiliationNumber)
    if (xml === null) {
      setCheck('error')
      return
    }
    const parsed = parseClubDetailXml(xml)
    if (!parsed) {
      setCheck('not_found')
      return
    }
    setLive(parsed)
    setCheck('done')
  }

  const decide = async (status: 'approved' | 'rejected') => {
    setBusy(true)
    setError(null)
    try {
      await decideClubAdminRequest(
        request.id,
        {
          status,
          ...(note.trim() ? { note: note.trim() } : {}),
          // Only the live reading is ever written to a new club — never the
          // name the requester submitted.
          ...(status === 'approved' && live
            ? {
                club: {
                  displayName: live.displayName,
                  venueLabel: live.venueLabel,
                  street: live.street,
                  postalCode: live.postalCode,
                  city: live.city,
                },
              }
            : {}),
        },
        headers,
      )
      onDone()
    } catch (e) {
      setError((e as Error).message || 'La décision n’a pas pu être enregistrée.')
    } finally {
      setBusy(false)
    }
  }

  const liveMatch = live ? emailMatch(request.email, live.correspondent?.email) : null
  const needsClub = !request.clubId

  return (
    <ModalShell onClose={onClose} labelledBy="decide-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="decide-title" className="font-display text-lg font-semibold text-slate-800">
          {request.firstName} {request.lastName}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Demande d’administrer le club n° {request.affiliationNumber} avec l’adresse{' '}
          {request.email}.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Vérification auprès de la FFTT
            </p>
            <button
              type="button"
              onClick={verify}
              disabled={check === 'loading'}
              className={`text-sm font-medium text-accent-600 hover:text-accent-800 disabled:opacity-50 ${TEXT_TARGET_CLASS}`}
            >
              {check === 'loading' ? 'Vérification…' : check === 'done' ? 'Revérifier' : 'Vérifier maintenant'}
            </button>
          </div>

          {check === 'idle' && (
            <p className="mt-2 text-sm text-slate-600">
              Les informations ci-dessous proviennent du navigateur du demandeur. Interrogez la
              FFTT depuis le vôtre pour les confronter.
            </p>
          )}
          {check === 'not_found' && (
            <p className="mt-2 text-sm text-red-800">
              La FFTT ne connaît aucun club portant ce numéro.
            </p>
          )}
          {check === 'error' && (
            <p className="mt-2 text-sm text-red-800">La FFTT n’a pas répondu. Réessayez.</p>
          )}

          {check === 'done' && live && (
            <dl className="mt-3 space-y-3">
              <Comparison
                label="Nom du club"
                declared={request.snapshot.displayName}
                live={live.displayName}
              />
              <Comparison
                label="Correspondant"
                declared={request.snapshot.correspondentName}
                live={correspondentName(live.correspondent)}
              />
              <Comparison
                label="Adresse du correspondant"
                declared={request.snapshot.correspondentEmail}
                live={live.correspondent?.email ?? ''}
              />
              <Comparison
                label="Lieu de jeu"
                declared={request.snapshot.venue}
                live={
                  formatVenue({
                    label: live.venueLabel,
                    street: live.street,
                    postalCode: live.postalCode,
                    city: live.city,
                  }) ?? ''
                }
              />
              {liveMatch && (
                <p
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    EMAIL_MATCH_TONE[liveMatch] === 'strong'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {EMAIL_MATCH_LABELS[liveMatch]}
                </p>
              )}
            </dl>
          )}
        </div>

        {needsClub && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Ce club n’existe pas encore. L’accepter le créera, avec le nom et le lieu de jeu lus à
            l’instant auprès de la FFTT.
            {check !== 'done' && ' Vérifiez d’abord pour que ces informations soient reprises.'}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="decide-note" className="block text-sm font-medium text-slate-700">
            Motif (facultatif, conservé avec la demande)
          </label>
          <textarea
            id="decide-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          La personne ne sera pas prévenue : dites-le-lui vous-même. Une fois acceptée, elle se
          connecte avec son adresse.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => decide('rejected')}
            disabled={busy}
            className={`${NEUTRAL_BUTTON_CLASS} text-red-700 disabled:opacity-50`}
          >
            Refuser
          </button>
          <button
            type="button"
            onClick={() => decide('approved')}
            disabled={busy || (needsClub && check !== 'done')}
            title={
              needsClub && check !== 'done'
                ? 'Vérifiez le club auprès de la FFTT avant de créer ce club.'
                : undefined
            }
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            Accepter
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

/** One row of the confrontation: what was declared, and what FFTT says now. */
function Comparison({ label, declared, live }: { label: string; declared: string; live: string }) {
  const same = declared.trim().toLowerCase() === live.trim().toLowerCase()
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm">
        <span className="text-slate-800">{live || '—'}</span>
        {!same && (
          <span className="block text-xs text-amber-700">
            Déclaré&nbsp;: {declared || '—'}
          </span>
        )}
      </dd>
    </div>
  )
}
