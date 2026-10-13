import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { ProfileList } from '@/components/ProfileSwitcher'
import { getRoleLabel } from '@/mock/data'
import { GENERAL_ADMINISTRATION, hasOtherProfiles } from '@/lib/profiles'

/**
 * The header's account menu (#720 in the app, #722 on the web): who is
 * signed in — name, club, role — and the way to Compte, then every other
 * profile the person may open, by club, one click to switch.
 *
 * A disclosure hung under its button, closed by a click outside, Escape or
 * any navigation. `compact` is the phone header's: the avatar alone, next to
 * the menu button.
 */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, displayName, profiles } = useAuth()
  const { players, clubs } = useAppData()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [location])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const avatarUpdatedAt = players.find((p) => p.id === user.id)?.avatarUpdatedAt
  const clubName = user.role === 'general_admin'
    ? GENERAL_ADMINISTRATION
    : profiles.find((p) => p.id === user.id)?.clubName ?? clubs.find((c) => c.id === user.clubId)?.displayName
  const menuId = compact ? 'account-menu-compact' : 'account-menu'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        // The name is what the button is called, visible or not: the avatar's
        // initials would otherwise be read before it.
        aria-label={compact ? displayName : undefined}
        title="Mon compte"
        className={`flex items-center gap-2 rounded-lg ${
          compact ? 'h-11 w-11 justify-center' : 'py-1 pl-1 pr-2'
        } hover:bg-slate-100`}
      >
        <span aria-hidden>
          <Avatar
            playerId={user.id}
            avatarUpdatedAt={avatarUpdatedAt}
            firstName={user.firstName}
            lastName={user.lastName}
            size={28}
          />
        </span>
        {!compact && <span className="text-sm font-medium text-slate-800">{displayName}</span>}
      </button>

      {open && (
        <div
          id={menuId}
          // On a phone the menu button sits right of the avatar, so a card
          // anchored to it would run off the left edge: it spans the screen,
          // 16px in, under the bar.
          className={`z-30 flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ${
            compact ? 'fixed inset-x-4 top-16' : 'absolute right-0 top-full mt-2 w-80'
          }`}
        >
          <div className="flex items-center gap-3 p-4">
            <Avatar
              playerId={user.id}
              avatarUpdatedAt={avatarUpdatedAt}
              firstName={user.firstName}
              lastName={user.lastName}
              size={44}
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{displayName}</p>
              {clubName && <p className="truncate text-sm text-slate-700">{clubName}</p>}
              <p className="text-xs text-slate-500">{getRoleLabel(user.role)}</p>
            </div>
          </div>
          <Link
            to="/compte"
            className="flex min-h-11 items-center justify-between border-t border-slate-200 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Mon compte
            <span aria-hidden className="text-slate-400">›</span>
          </Link>
          {hasOtherProfiles(profiles, user.id) && (
            <div className="overflow-y-auto border-t border-slate-200 px-4 pb-3 pt-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Changer de profil</p>
              <ProfileList includeCurrent={false} onSwitched={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
