import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import { ProfileList } from '@/components/ProfileSwitcher'
import { getRoleLabel } from '@/mock/data'
import { hasOtherProfiles, managedSession, profileClubName } from '@/lib/profiles'
import type { Profile } from '@/types'

/**
 * The header's account menu (#720 in the app, #722 on the web): who is
 * signed in — name, club, role — and the way to Compte, then every profile
 * the person may open, one click to switch.
 *
 * The button is the photo with the club in its corner (#749), so which club
 * one is in reads without opening anything; on a desktop the club is also
 * named under the name. On someone else's profile the photo is ringed — the
 * banner under the header says whose.
 *
 * A disclosure hung under its button, closed by a click outside, Escape or
 * any navigation. `compact` is the phone header's: the avatar alone, next to
 * the menu button.
 */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, displayName, profiles } = useAuth()
  const { players, users, clubs } = useAppData()
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
  // The person's photo (#741) — on `users` too, for a profile that does not play.
  const avatarUpdatedAt = (players.find((p) => p.id === user.id) ?? users.find((u) => u.id === user.id))?.avatarUpdatedAt
  // The server names the club with the profile; `/api/data` for a session
  // restored before the profiles came back.
  const current: Profile = profiles.find((p) => p.id === user.id) ?? {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    clubId: user.clubId,
    clubName: clubs.find((c) => c.id === user.clubId)?.displayName,
  }
  const clubName = current.clubId || user.role === 'general_admin' ? profileClubName(current) : undefined
  const managed = !!managedSession(profiles, user.id)
  const menuId = compact ? 'account-menu-compact' : 'account-menu'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        // The name and the club are what the button is called, visible or
        // not: the avatar's initials would otherwise be read before them.
        aria-label={compact ? [displayName, clubName].filter(Boolean).join(', ') : undefined}
        title="Mon compte"
        className={`flex items-center gap-2.5 rounded-lg text-left ${
          compact ? 'h-11 w-11 justify-center' : 'py-1 pl-1 pr-2'
        } hover:bg-slate-100`}
      >
        <span aria-hidden className="flex">
          <ProfileAvatar profile={current} avatarUpdatedAt={avatarUpdatedAt} size={compact ? 30 : 32} managed={managed} />
        </span>
        {!compact && (
          <span className="leading-tight">
            <span className="block text-sm font-medium text-slate-800">{displayName}</span>
            {clubName && <span className="block text-xs text-slate-500">{clubName}</span>}
          </span>
        )}
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
            <ProfileAvatar profile={current} avatarUpdatedAt={avatarUpdatedAt} size={44} managed={managed} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{displayName}</p>
              <p className="truncate text-sm text-slate-600">
                {[clubName, getRoleLabel(user.role)].filter(Boolean).join(' · ')}
              </p>
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
            <div className="overflow-y-auto border-t border-slate-200 px-2 pb-2 pt-3">
              <ProfileList onSwitched={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
