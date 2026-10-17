import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import { clubInitial } from '@/lib/clubTown'
import { profileClubName } from '@/lib/profiles'
import type { Profile } from '@/types'

// What tells a person's profiles apart (#749): the club, drawn as its logo —
// or its town's initial, when it has none — and a shield for the general
// administration, a role of the person rather than a club (#655).

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

/** A profile's club, as a mark: logo, initial, or the general administration's shield. */
export function ProfileClubMark({ profile, size, className = '' }: {
  profile: Profile
  size: number
  className?: string
}) {
  const { clubs } = useAppData()
  if (profile.role === 'general_admin' || !profile.clubId) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 ${className}`}
        style={{ width: size, height: size }}
      >
        <ShieldIcon className="h-[60%] w-[60%]" />
      </span>
    )
  }
  return (
    <ClubLogo
      clubId={profile.clubId}
      logoUpdatedAt={clubs.find((c) => c.id === profile.clubId)?.logoUpdatedAt}
      fallback={clubInitial(profileClubName(profile))}
      size={size}
      className={className}
    />
  )
}

/**
 * A profile's photo with its club in the corner — the header's button, the
 * top of the account menu, a delegated profile's row. `managed` rings it in
 * the accent: the session is somebody else's.
 */
export function ProfileAvatar({ profile, avatarUpdatedAt, size, managed = false }: {
  profile: Profile
  avatarUpdatedAt?: string
  size: number
  managed?: boolean
}) {
  const badge = Math.max(16, Math.round(size * 0.5))
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <Avatar
        playerId={profile.id}
        avatarUpdatedAt={avatarUpdatedAt}
        firstName={profile.firstName}
        lastName={profile.lastName}
        size={size}
        className={managed ? 'ring-2 ring-accent-500' : ''}
      />
      <ProfileClubMark
        profile={profile}
        size={badge}
        className="absolute -bottom-1 -right-1 ring-2 ring-white"
      />
    </span>
  )
}
