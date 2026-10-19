import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ProfileAvatar, ProfileClubMark } from '@/components/ProfileAvatar'
import { getRoleLabel } from '@/mock/data'
import { profileClubName, profileFederations, profileName, profileSections } from '@/lib/profiles'
import type { Profile } from '@/types'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-accent-600" aria-hidden>
      <path d="M5 12l5 5 9-10" />
    </svg>
  )
}

/**
 * The profiles the signed-in person may open, and a tap to become one (#640)
 * — one list for the header's account menu and Compte.
 *
 * Two flat lists (#749): « Mes clubs », where a row IS the club — logo, name,
 * role — because the person's own profiles differ by nothing else; then
 * « Profils que vous gérez », where a row is the other person, photo badged
 * with their club. The current profile is listed and ticked, so the list
 * reads as a choice already made rather than « where else ».
 *
 * Switching lands on the Accueil: the page under it was the previous
 * profile's, and may be one the next cannot open at all (a club's admin
 * screens, under a child who only plays).
 */
export function ProfileList({ onSwitched }: { onSwitched?: () => void }) {
  const { user, profiles, switchProfile } = useAuth()
  const { players, users, clubs, federations = [] } = useAppData()
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

  const { own, managed } = profileSections(profiles)
  const avatarOf = (id: string) => (players.find((x) => x.id === id) ?? users.find((x) => x.id === id))?.avatarUpdatedAt
  const role = (p: Profile) => `${getRoleLabel(p.role)}${p.status === 'archived' ? ' · Archivé' : ''}`

  // The club's federations beside its name (#767): Landser is the AGR's,
  // Rixheim the FFTT's, Bootzheim both — nothing else on the row said so.
  const pills = (p: Profile) => {
    const names = profileFederations(p, clubs, federations)
    return names.length > 0 && (
      <span className="flex shrink-0 gap-1" data-testid={`profile-federations-${p.id}`}>
        {names.map((n) => (
          <span key={n} className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold leading-4 text-slate-600">{n}</span>
        ))}
      </span>
    )
  }

  /** A row: the club's name carries its federations, in the title (own) or the subtitle (managed). */
  const row = (p: Profile, mark: ReactNode, title: string, roleText: string, clubIn: 'title' | 'subtitle') => {
    const current = p.id === user?.id
    return (
      <li key={p.id}>
        <button
          type="button"
          onClick={() => choose(p)}
          disabled={current || !!busy}
          aria-current={current ? 'true' : undefined}
          className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-2 text-left disabled:cursor-default ${
            current ? 'bg-accent-50' : 'hover:bg-slate-50 disabled:hover:bg-transparent'
          }`}
        >
          <span aria-hidden className="flex">{mark}</span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
              {clubIn === 'title' && pills(p)}
            </span>
            {clubIn === 'title' ? (
              <span className="block truncate text-xs text-slate-500">{roleText}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                <span className="shrink-0">{profileClubName(p)}</span>
                {pills(p)}
                <span className="truncate">{` · ${roleText}`}</span>
              </span>
            )}
          </span>
          {current ? (
            <>
              <CheckIcon />
              <span className="sr-only">Profil actuel</span>
            </>
          ) : busy === p.id ? (
            <span className="text-xs text-slate-500">…</span>
          ) : null}
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-3" data-testid="profile-list">
      {own.length > 0 && (
        <section>
          <h3 className="px-2 text-xs font-semibold text-slate-600">Mes clubs</h3>
          <ul className="mt-1 space-y-0.5">
            {own.map((p) => row(p, <ProfileClubMark profile={p} size={36} />, profileClubName(p), role(p), 'title'))}
          </ul>
        </section>
      )}
      {managed.length > 0 && (
        <section className={own.length > 0 ? 'border-t border-slate-200 pt-3' : ''}>
          <h3 className="px-2 text-xs font-semibold text-slate-600">Profils que vous gérez</h3>
          <ul className="mt-1 space-y-0.5">
            {managed.map((p) => row(
              p,
              <ProfileAvatar profile={p} avatarUpdatedAt={avatarOf(p.id)} size={36} />,
              profileName(p),
              role(p),
              'subtitle',
            ))}
          </ul>
        </section>
      )}
      {failed && (
        <p role="alert" className="px-2 text-sm text-red-600">
          Impossible de changer de profil. Vérifiez votre connexion.
        </p>
      )}
    </div>
  )
}
