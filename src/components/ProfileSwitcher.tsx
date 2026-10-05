import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS } from '@/components/Button'
import { getRoleLabel } from '@/mock/data'
import { profileName, profilesByClub } from '@/lib/profiles'
import type { Profile } from '@/types'

/**
 * The profiles of the signed-in address, by club, and a tap to become one
 * (#640) — a parent opening their child's matches.
 *
 * Switching lands on the Accueil: the page under it was the previous
 * profile's, and may be one the next cannot open at all (a club's admin
 * screens, under a child who only plays).
 */
export function ProfileList({ onSwitched }: { onSwitched?: () => void }) {
  const { user, profiles, switchProfile } = useAuth()
  const { players } = useAppData()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(p: Profile) {
    if (p.id === user?.id || busy) return
    setBusy(p.id)
    setFailed(false)
    try {
      await switchProfile(p.id)
      onSwitched?.()
      navigate('/', { replace: true })
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4" data-testid="profile-list">
      {profilesByClub(profiles).map((club) => (
        <section key={club.clubId ?? ''}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{club.clubName}</h3>
          <ul className="mt-1 divide-y divide-slate-100">
            {club.profiles.map((p) => {
              const current = p.id === user?.id
              const avatarUpdatedAt = players.find((x) => x.id === p.id)?.avatarUpdatedAt
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(p)}
                    disabled={current || !!busy}
                    aria-current={current ? 'true' : undefined}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <Avatar
                      playerId={p.id}
                      avatarUpdatedAt={avatarUpdatedAt}
                      firstName={p.firstName ?? ''}
                      lastName={p.lastName ?? ''}
                      sizeClass="h-9 w-9"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{profileName(p)}</span>
                      <span className="block text-xs text-slate-500">
                        {getRoleLabel(p.role)}
                        {p.status === 'archived' ? ' · Archivé' : ''}
                      </span>
                    </span>
                    {current ? (
                      <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700">
                        Profil actuel
                      </span>
                    ) : busy === p.id ? (
                      <span className="text-xs text-slate-500">…</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          Impossible de changer de profil. Vérifiez votre connexion.
        </p>
      )}
    </div>
  )
}

/** The same list in a dialog, from the header. */
export function ProfileSwitcherDialog({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} closeOnBackdrop labelledBy="profile-switcher-title">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h2 id="profile-switcher-title" className="font-display text-lg font-semibold text-slate-800">
          Changer de profil
        </h2>
        <p className="mt-1 text-sm text-slate-500">Les profils liés à votre adresse e-mail.</p>
        <div className="mt-4">
          <ProfileList onSwitched={onClose} />
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

/** Two arrows passing each other — the switcher's icon in the header. */
export function SwitchProfileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h13a4 4 0 0 1 4 4" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H8a4 4 0 0 1-4-4" />
    </svg>
  )
}
