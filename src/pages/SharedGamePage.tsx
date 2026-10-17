import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { getTeamName } from '@/lib/teamName'
import { profileName } from '@/lib/profiles'
import { sharedGameOpening, type SharedGameCandidate } from '@/lib/gameShare'

/**
 * Where a shared match link lands (#747): `/match/<id>?equipe=<team>`.
 *
 * It decides whose profile opens the match — never the profile the browser was
 * left on — switches to it if it must, and hands over to the match screen with
 * that profile's side. When two reached profiles play in it (a parent and the
 * child they manage) it asks. The rule is `sharedGameOpening`, the app's too.
 */
export function SharedGamePage() {
  const { gameId = '' } = useParams<{ gameId: string }>()
  const [searchParams] = useSearchParams()
  const hintTeamId = searchParams.get('equipe') ?? undefined
  const { user, profiles, switchProfile } = useAuth()
  const { games, teams, clubs, gameSelections, players, users } = useAppData()
  const [chosen, setChosen] = useState<SharedGameCandidate | null>(null)
  const [failed, setFailed] = useState(false)

  const game = games.find((g) => g.id === gameId)
  const opening = useMemo(
    () => (game && user
      ? sharedGameOpening({
        shared: { gameId, teamId: hintTeamId },
        game, teams, gameSelections, profiles, currentProfile: user,
      })
      : null),
    [game, user, gameId, hintTeamId, teams, gameSelections, profiles],
  )

  const target = chosen ?? (opening?.kind === 'open' ? opening : null)
  const mustSwitch = !!target && !!user && target.profileId !== user.id

  useEffect(() => {
    if (!mustSwitch || !target || failed) return
    let cancelled = false
    switchProfile(target.profileId).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [mustSwitch, target, failed, switchProfile])

  if (!game) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Match introuvable.
        </p>
        <Link to="/journees" className={`text-sm font-medium text-accent-600 hover:text-accent-700 ${TEXT_TARGET_CLASS}`}>
          ← Retour aux journées
        </Link>
      </div>
    )
  }

  const matchPath = (teamId: string) => `/journees/${encodeURIComponent(game.id)}?equipe=${encodeURIComponent(teamId)}`

  // A switch refused or unreachable: the match is still readable, from the
  // side it was meant for, under whoever is signed in.
  if (failed && target) return <Navigate to={matchPath(target.teamId)} replace />
  if (target && !mustSwitch) return <Navigate to={matchPath(target.teamId)} replace />
  if (target) {
    return <p className="p-6 text-center text-sm text-slate-500">Changement de profil…</p>
  }
  if (opening?.kind !== 'ask') return null

  const teamLabel = (teamId: string) => {
    const t = teams.find((x) => x.id === teamId)
    return t ? getTeamName(t, clubs) : ''
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h1 className="font-display text-lg font-semibold text-slate-800">Ouvrir le match en tant que…</h1>
      <p className="mt-1 text-sm text-slate-500">Plusieurs de vos profils jouent ce match.</p>
      <ul className="mt-3 divide-y divide-slate-100" data-testid="shared-game-profiles">
        {opening.candidates.map((c) => {
          const p = profiles.find((x) => x.id === c.profileId) ?? (user?.id === c.profileId ? user : undefined)
          const avatarUpdatedAt = (players.find((x) => x.id === c.profileId) ?? users.find((x) => x.id === c.profileId))?.avatarUpdatedAt
          return (
            <li key={c.profileId}>
              <button
                type="button"
                onClick={() => setChosen(c)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50"
              >
                <Avatar
                  playerId={c.profileId}
                  avatarUpdatedAt={avatarUpdatedAt}
                  firstName={p?.firstName ?? ''}
                  lastName={p?.lastName ?? ''}
                  sizeClass="h-9 w-9"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{p ? profileName(p) : ''}</span>
                  <span className="block truncate text-xs text-slate-500">{teamLabel(c.teamId)}</span>
                </span>
                {c.profileId === user?.id && (
                  <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700">
                    Profil actuel
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
