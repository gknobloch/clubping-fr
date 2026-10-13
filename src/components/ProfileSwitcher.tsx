import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
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
export function ProfileList({ onSwitched, includeCurrent = true }: {
  onSwitched?: () => void
  /** The header's account menu shows the current profile above the list (#722). */
  includeCurrent?: boolean
}) {
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
      {profilesByClub(includeCurrent ? profiles : profiles.filter((p) => p.id !== user?.id)).map((club) => (
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
