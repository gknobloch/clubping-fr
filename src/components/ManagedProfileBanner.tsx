import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { managedSession, profileName } from '@/lib/profiles'

/**
 * Under the header while the session is somebody else's profile (#749):
 * Nathan, opening Chloé's because she delegated to him (#655), answers her
 * availabilities and sees her matches — and has to know it on every page, not
 * only in the account menu. One click goes back to the profile that signed in.
 *
 * Part of the sticky header, so it does not scroll away. Nothing on one's own
 * profiles: there, the club badge on the avatar says enough.
 */
export function ManagedProfileBanner() {
  const { user, profiles, switchProfile } = useAuth()
  const { players, users } = useAppData()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const session = managedSession(profiles, user?.id)
  if (!session) return null
  const { current, home } = session

  async function goHome() {
    if (!home || busy) return
    setBusy(true)
    setFailed(false)
    try {
      await switchProfile(home.id)
      navigate('/', { replace: true })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const homeAvatar = home
    ? (players.find((x) => x.id === home.id) ?? users.find((x) => x.id === home.id))?.avatarUpdatedAt
    : undefined

  return (
    <div
      role="status"
      data-testid="managed-profile-banner"
      className="border-t border-accent-200 bg-accent-50 text-sm text-accent-800"
    >
      <div className="mx-auto flex min-h-11 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 sm:px-6">
        <span className="min-w-0 flex-1">
          <span className="hidden sm:inline">Vous gérez le profil de </span>
          <span className="sm:hidden">Profil de </span>
          <strong className="font-semibold">{profileName(current)}</strong>
        </span>
        {failed && (
          <span role="alert" className="text-xs text-red-700">Impossible de revenir. Vérifiez votre connexion.</span>
        )}
        {home && (
          <button
            type="button"
            onClick={goHome}
            disabled={busy}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-accent-200 bg-white px-3 font-semibold text-accent-700 hover:bg-accent-100 disabled:opacity-60 md:min-h-9"
          >
            <Avatar
              playerId={home.id}
              avatarUpdatedAt={homeAvatar}
              firstName={home.firstName}
              lastName={home.lastName}
              size={20}
            />
            Revenir à mon profil
          </button>
        )}
      </div>
    </div>
  )
}
