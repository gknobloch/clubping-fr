import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { useMatchDayEditing } from '@/lib/useMatchDayEditing'
import { gameDate } from '@/lib/matchdays'
import { sortByName } from '@/lib/sortByName'
import {
  AVAILABILITY_COLORS,
  AVAILABILITY_LABELS,
  AvailabilitySelect,
  ReadOnlyCompo,
  TeamSelect,
} from '@/components/availabilityControls'
import type { Player } from '@/types'

/**
 * One team's view of one game: the roster laid out vertically with its
 * availability and line-up controls.
 *
 * The matrix on /journees is the right tool on a wide screen, but it is 964px
 * of columns — it cannot be made to fit a phone (#306). This is the mobile
 * answer, and it mirrors the native app's match screen so the two platforms
 * teach the same model. It renders at any width so a shared link works
 * anywhere; only the way in is mobile-only.
 */
export function MatchDayDetailPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [searchParams] = useSearchParams()
  const teamId = searchParams.get('equipe')

  const { user } = useAuth()
  const { teams, players, matchDays, games, divisions, gameSelections } = useAppData()

  const game = games.find((g) => g.id === gameId)
  const team = teams.find((t) => t.id === teamId)
  const matchDay = game ? matchDays.find((md) => md.id === game.matchDayId) : undefined

  const {
    getAvailability,
    canEditAvailability,
    isOverride,
    canEditGameSelection,
    getSelectedTeamForMatchDay,
    setPlayerSelectedForMatchDay,
    orderedTeamOptionIds,
    getTeamSelectLabel,
    getTeamColor,
    getTeamLabel,
    setGameAvailability,
    clearGameAvailability,
  } = useMatchDayEditing(team?.phaseId ?? null)

  const roster = useMemo(() => {
    if (!team) return [] as Player[]
    const byId = new Map(players.map((p) => [p.id, p]))
    return sortByName(
      (team.playerIds ?? []).map((pid) => byId.get(pid)).filter((p): p is Player => p != null)
    )
  }, [team, players])

  if (!game || !team || !matchDay) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Match introuvable.
        </p>
        <Link to="/journees" className="text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Retour aux journées
        </Link>
      </div>
    )
  }

  const isHome = game.homeTeamId === team.id
  const opponentId = isHome ? game.awayTeamId : game.homeTeamId
  const playersPerGame = divisions.find((d) => d.id === team.divisionId)?.playersPerGame ?? 4

  const selectedIds = gameSelections.find(
    (s) => s.gameId === game.id && s.teamId === team.id
  )?.playerIds ?? []

  // Players picked for this team without being on its roster. They only appear
  // in the "Autres joueurs" matrix, which is desktop-only, so without this they
  // would silently vanish from the line-up on a phone (#306).
  const rosterIds = new Set(roster.map((p) => p.id))
  const borrowed = players.filter((p) => selectedIds.includes(p.id) && !rosterIds.has(p.id))
  const availableCount = roster.filter((p) => getAvailability(game.id, p.id) === 'available').length

  const date = gameDate(game, matchDay)
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const canEditSel = canEditGameSelection(team.id)
  const compoOk = selectedIds.length === playersPerGame
  const availOk = availableCount >= playersPerGame

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/journees"
        className="inline-flex h-11 items-center text-sm font-medium text-accent-600 hover:text-accent-700 md:h-auto"
      >
        ← Retour aux journées
      </Link>

      {/* Summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Journée {matchDay.number}
        </p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-xl font-semibold text-slate-800">
          {team.color && (
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: team.color }}
              aria-hidden
            />
          )}
          {getTeamLabel(team.id)}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isHome ? 'Reçoit' : 'Se déplace à'} {getTeamLabel(opponentId)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {dateLabel}
          {game.time ? ` · ${game.time}` : ''}
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          <span
            className={`rounded-full px-2.5 py-1 ${availOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {availableCount} dispo
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${compoOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            Compo {selectedIds.length}/{playersPerGame}
          </span>
        </div>
      </div>

      {/* Roster — one player per block, controls stacked so nothing needs a
          sideways scroll on a 375px screen. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-display text-base font-medium text-slate-800">
          Disponibilités et composition
        </h2>
        {roster.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Aucun joueur dans l'effectif.</p>
        ) : (
          <ul>
            {[...roster, ...borrowed].map((player) => {
              const status = getAvailability(game.id, player.id)
              const canEditAv = canEditAvailability(player.id, team.id)
              const selectedTeamId = getSelectedTeamForMatchDay(matchDay.id, player.id)
              const isMe = player.id === user?.id
              const isBorrowed = !rosterIds.has(player.id)
              return (
                <li key={player.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-medium text-slate-800 ${player.id === team.captainId ? 'font-bold' : ''}`}
                    >
                      {player.firstName} {player.lastName}
                    </span>
                    {team.rosterInitialPoints?.[player.id] && (
                      <span className="text-sm text-slate-500">
                        ({team.rosterInitialPoints[player.id]})
                      </span>
                    )}
                    {isMe && (
                      <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
                        Moi
                      </span>
                    )}
                    {isBorrowed && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Renfort
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">Dispo</span>
                      {canEditAv ? (
                        <AvailabilitySelect
                          value={status}
                          onChange={(v) => {
                            if (v) setGameAvailability(game.id, player.id, v, isOverride(player.id, team.id))
                            else if (status) clearGameAvailability(game.id, player.id)
                          }}
                        />
                      ) : (
                        <span className="inline-flex min-h-[26px] items-center gap-1 text-xs text-slate-600">
                          {status ? (
                            <>
                              <span
                                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: AVAILABILITY_COLORS[status] }}
                                aria-hidden
                              />
                              {AVAILABILITY_LABELS[status]}
                            </>
                          ) : (
                            '—'
                          )}
                        </span>
                      )}
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">Compo</span>
                      {canEditSel ? (
                        <TeamSelect
                          value={selectedTeamId}
                          onChange={(v) => setPlayerSelectedForMatchDay(matchDay.id, player.id, v)}
                          optionIds={orderedTeamOptionIds(team.id, player.id, matchDay.id)}
                          getLabel={getTeamSelectLabel}
                          getColor={getTeamColor}
                        />
                      ) : (
                        <span className="inline-flex min-h-[26px] items-center">
                          <ReadOnlyCompo
                            teamId={selectedTeamId}
                            getLabel={getTeamSelectLabel}
                            getColor={getTeamColor}
                          />
                        </span>
                      )}
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
