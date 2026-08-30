import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, DEV_LOGIN } from '@/contexts/AuthContext'
import { IS_PR_PREVIEW } from '@/lib/preview'
import { BrandMark } from '@/components/BrandMark'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { getDisplayNameForUser } from '@/mock/data'
import type { ApiError } from '@/lib/authApi'
import type { DevUser, User } from '@/types'

// Shared header for both ways in — the e-mail code form and the preview's
// standalone picker (#313). The mark appears nowhere else above 28px, and the
// login screen is the only place a member sees the app before knowing what it
// does (#351).
/**
 * The page around both ways in. The app dresses its content in white cards on a
 * slate background; the login screen used to be the one place that left its
 * form bare on the page, which is what made it look unfinished (#351).
 *
 * The accent wash sits behind the mark only — enough to give the screen a
 * centre of gravity, far too faint to fight the form for attention.
 */
function LoginLayout({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    // No `overflow-hidden` here, tempting as it is for the wash: it clips the
    // picker's suggestion list where it runs past the fold, and with the
    // overflow hidden there is no scrolling to it either. The wash is centred
    // and narrower than the narrowest phone, so it never overflows on its own.
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      {/* Centred on the mark, not on the page top, or it reads as a coloured
          band across the header instead of a glow behind the logo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/[0.07] blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <LoginHeader caption={caption} />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        {/* Above the legal footnote and in full size, because it *is* a way in
            (#474): someone whose club the app does not know gets no code from
            the form above — nothing happens, and this is the only thing that
            tells them why and what to do instead. */}
        {/* Question and answer on their own lines. As one flowing paragraph
            the wrap fell inside the link ("Demandez à / l’administrer"), which
            reads as a broken sentence rather than as one thing to tap. */}
        <div className="mt-5 text-center text-sm">
          <p className="text-slate-600">Votre club n’est pas encore sur Club Ping&nbsp;?</p>
          <Link
            className={`font-medium text-accent-600 underline hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
            to="/rejoindre"
          >
            Demandez à l’administrer
          </Link>
        </div>
        {/* The stores want the policy reachable from the app itself, not only
            from the listing (#356). Muted: it is a legal footnote, not a way in. */}
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link className="underline hover:text-slate-600" to="/confidentialite">
            Politique de confidentialité
          </Link>
          {' · '}
          <Link className="underline hover:text-slate-600" to="/suppression-compte">
            Supprimer mon compte
          </Link>
        </p>
      </div>
    </div>
  )
}

function LoginHeader({ caption }: { caption: string }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      {/* The mark on its own disc: it reads as a logo rather than as a drawing
          dropped on the page, and lifts it off the wash behind it. */}
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <BrandMark className="h-16 w-16 text-slate-800" title="Club Ping" />
      </span>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-slate-800">
        Club Ping
      </h1>
      {/* Narrower than the form on purpose — a centred line this long is hard
          to read at the full 448px — but wide enough to avoid a one-word last
          line. */}
      <p className="mt-2 max-w-sm text-balance text-sm text-slate-600">
        Le tennis de table de club au quotidien{'\u00A0'}: joueurs, équipes, disponibilités
        et composition des rencontres.
      </p>
      {/* Kept distinct from the description: this one changes with the step. */}
      <p className="mt-4 text-sm text-slate-500">{caption}</p>
    </div>
  )
}

function authErrorMessage(e: unknown): string {
  switch ((e as ApiError)?.code) {
    case 'invalid_code':
      return 'Code invalide ou expiré.'
    case 'too_many_attempts':
      return 'Trop de tentatives. Demandez un nouveau code.'
    case 'no_account':
      return 'Aucun compte associé à cet e-mail.'
    case 'invalid_email':
      return 'Adresse e-mail invalide.'
    default:
      return 'Une erreur est survenue. Réessayez.'
  }
}

export function LoginPage() {
  const { requestCode, verifyCode } = useAuth()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRequestCode = useCallback(async () => {
    if (!email.includes('@')) {
      setError('Adresse e-mail invalide.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { devCode: issuedCode } = await requestCode(email.trim())
      setDevCode(issuedCode ?? null)
      setStep('code')
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [email, requestCode])

  const handleVerify = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email.trim(), code.trim())
      // PublicRoute redirects to "/" once authenticated.
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [email, code, verifyCode])

  // On a PR preview the OTP flow is not merely supplemented by the dev login,
  // it is replaced by it: a preview runs against an anonymised database whose
  // addresses are all @example.invalid, so "receive a code" could never deliver
  // one. Offering it would be a dead end. Production and local dev are
  // untouched — locally the backend returns the code as `devCode`, which is
  // how the real flow stays testable (#138).
  const devLoginOnly = DEV_LOGIN && IS_PR_PREVIEW

  if (devLoginOnly) {
    return (
      <LoginLayout caption="Préversion — choisissez un utilisateur pour continuer">
        <DevLogin standalone />
      </LoginLayout>
    )
  }

  return (
    <LoginLayout
      caption={step === 'email' ? 'Connectez-vous pour continuer' : `Code envoyé à ${email}`}
    >
      <>
        {error && <p className="mb-4 text-sm font-medium text-red-600 text-center">{error}</p>}

        {step === 'email' ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRequestCode()}
                placeholder="vous@exemple.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
            <button
              type="button"
              onClick={handleRequestCode}
              disabled={busy}
              className="w-full rounded-lg bg-accent-600 px-4 py-3 font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
            >
              {busy ? 'Envoi…' : 'Recevoir un code'}
            </button>
            {/* Google + Apple sign-in are hidden until the OAuth client IDs
                are configured (#129 / #100). `src/lib/webOAuth.ts` and
                `AuthContext.loginWithIdToken` stay in place so re-enabling
                the UI is a one-line change. */}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1">
                Code à 6 chiffres
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerify()}
                placeholder="123456"
                autoFocus
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-900 placeholder-slate-300 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
            {devCode && <p className="text-sm text-slate-500">Code (dev) : {devCode}</p>}
            <button
              type="button"
              onClick={handleVerify}
              disabled={busy || code.length < 6}
              className="w-full rounded-lg bg-accent-600 px-4 py-3 font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
            >
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={handleRequestCode} disabled={busy} className="text-accent-600 hover:underline">
                Renvoyer le code
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setDevCode(null)
                  setError(null)
                }}
                className="text-accent-600 hover:underline"
              >
                Modifier l’e-mail
              </button>
            </div>
          </div>
        )}

        {DEV_LOGIN && <DevLogin />}
      </>
    </LoginLayout>
  )
}

// A preview's database is anonymised (#313): every member has a pseudonym, so
// the name alone no longer says who administers what. The badge is the only
// thing left that distinguishes the accounts (#345).
const DEV_ROLE_BADGES: Record<User['role'], { label: string; className: string }> = {
  general_admin: { label: 'Admin général', className: 'bg-red-100 text-red-800' },
  club_admin: { label: 'Admin club', className: 'bg-indigo-100 text-indigo-800' },
  player: { label: 'Joueur', className: 'bg-slate-100 text-slate-600' },
}

function devRoleBadge(user: User) {
  return DEV_ROLE_BADGES[user.role]
}

// ---------------------------------------------------------------------------
// Dev-only "pick any user" login (hidden behind DEV_LOGIN). Kept as the E2E
// login path since the E2E server runs `vite dev` with no backend.
//
// `standalone` drops the separator that sets it apart from the OTP form: on a
// PR preview it is the whole login, not an alternative to something above it.
// ---------------------------------------------------------------------------
function DevLogin({ standalone = false }: { standalone?: boolean }) {
  const navigate = useNavigate()
  const { devLoginAs, devUsers } = useAuth()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return devUsers
    // Roles and club are searchable too: on an anonymised preview "admin" or
    // "capitaine" is the only useful thing to type (#345).
    return devUsers.filter((u) =>
      [
        u.email ?? '',
        getDisplayNameForUser(u),
        u.clubName ?? '',
        devRoleBadge(u).label,
        ...(u.captainOf?.length ? ['capitaine'] : []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [query, devUsers])

  const [error, setError] = useState<string | null>(null)

  const handleSelect = useCallback(
    async (user: DevUser) => {
      setError(null)
      try {
        // On a preview this is a round trip that mints a real session, so it
        // has to complete before navigating — and it can fail (#313).
        await devLoginAs(user.id)
        navigate('/', { replace: true })
      } catch {
        setError('Connexion impossible pour cet utilisateur.')
      }
    },
    [devLoginAs, navigate],
  )

  return (
    <div className={standalone ? '' : 'mt-8 border-t border-slate-200 pt-6'}>
      {!standalone && (
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Mode développement
        </p>
      )}
      {error && <p className="mb-2 text-sm font-medium text-red-600">{error}</p>}
      <div className="relative">
        <label htmlFor="user-search" className="block text-sm font-medium text-slate-700 mb-1">
          Utilisateur
        </label>
        <input
          id="user-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Nom ou adresse email..."
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          autoComplete="off"
        />
        {(focused || query) && (
          <ul
            className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg max-h-64 overflow-auto"
            role="listbox"
          >
            {suggestions.length === 0 ? (
              <li className="px-4 py-3 text-slate-500 text-sm">Aucun utilisateur trouvé</li>
            ) : (
              suggestions.map((user) => (
                <li
                  key={user.id}
                  role="option"
                  aria-selected={false}
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(user)
                  }}
                  className="cursor-pointer px-4 py-3 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-900">
                      {getDisplayNameForUser(user)}
                    </span>
                    {(() => {
                      const badge = devRoleBadge(user)
                      return (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      )
                    })()}
                    {user.captainOf && user.captainOf.length > 0 && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        Capitaine {user.captainOf.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {/* The club comes from the payload: on a preview it is a real
                        club that the mock fixtures know nothing about (#345). */}
                    {user.clubName ?? user.email}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
