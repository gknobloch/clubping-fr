import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { ChevronRightIcon } from '@/components/icons'
import { useMatchDayEditing } from '@/lib/useMatchDayEditing'
import { gameDate, playersCommittedElsewhere } from '@/lib/matchdays'
import { sortByName } from '@/lib/sortByName'
import { SelectionSheet } from '@/components/SelectionSheet'
import { MatchSheetView, type MatchSheetPlayer } from '@/components/MatchSheetView'
import { AvailabilityButtons, AvailabilityPills } from '@/components/Availability'
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
  const { teams, players, clubs, matchDays, games, divisions, gameSelections, setGameSelection } = useAppData()

  const game = games.find((g) => g.id === gameId)
  const team = teams.find((t) => t.id === teamId)
  const matchDay = game ? matchDays.find((md) => md.id === game.matchDayId) : undefined

  const {
    getAvailability,
    canEditAvailability,
    isOverride,
    canEditGameSelection,
    isEligibleForTeam,
    myClubTeamsInPhase,
    getTeamLabel,
    setGameAvailability,
    clearGameAvailability,
  } = useMatchDayEditing(team?.phaseId ?? null)

  const [composing, setComposing] = useState(false)
  const [showingSheet, setShowingSheet] = useState(false)

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
        <Link to="/journees" className={`text-sm font-medium text-accent-600 hover:text-accent-700 ${TEXT_TARGET_CLASS}`}>
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

  // Club players outside the roster who are still eligible for this team this
  // round (brûlage). Ineligible ones are left out here rather than shown
  // disabled: this sheet is the line-up itself, not a browse of the club.
  const eligibleOthers = players.filter(
    (p) =>
      p.clubId === team.clubId &&
      p.status === 'active' &&
      !rosterIds.has(p.id) &&
      isEligibleForTeam(p.id, team.id, matchDay.id),
  )

  // Already fielded by another of the club's teams this round — pickable
  // nowhere else, so the sheet locks them and says where they are.
  const committedElsewhere = playersCommittedElsewhere(
    team.id,
    matchDay.number,
    myClubTeamsInPhase,
    games,
    matchDays,
    gameSelections,
  )

  // Phase points live on the fielding team's roster; a renfort keeps the points
  // recorded by their own team this phase.
  const pointsFor = (playerId: string) =>
    team.rosterInitialPoints?.[playerId] ??
    myClubTeamsInPhase.find((t) => t.playerIds?.includes(playerId))?.rosterInitialPoints?.[playerId]

  const lineUp: MatchSheetPlayer[] = selectedIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => p != null)
    .map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      license: p.licenseNumber || undefined,
      points: pointsFor(p.id) || undefined,
    }))

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

      {/* Availability — the whole roster, one row each, with the same
          OUI/PE/NON control the Accueil card and the game modal use. Composing
          is a separate step below rather than a second column here: picking a
          line-up is one decision about a group, not a series of per-player
          ones (#382). */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Disponibilités
        </h2>
        {roster.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Aucun joueur dans l'effectif.</p>
        ) : (
          <ul>
            {[...roster, ...borrowed].map((player) => {
              const status = getAvailability(game.id, player.id)
              const canEditAv = canEditAvailability(player.id, team.id)
              const isMe = player.id === user?.id
              const isBorrowed = !rosterIds.has(player.id)
              const isPicked = selectedIds.includes(player.id)
              return (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm ${isMe ? 'font-semibold text-accent-600' : 'text-slate-800'} ${player.id === team.captainId ? 'font-bold' : ''}`}
                      >
                        {player.firstName} {player.lastName}
                      </span>
                      {isBorrowed && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Renfort
                        </span>
                      )}
                    </span>
                    {isPicked && (
                      <span className="text-[11px] font-medium text-green-700">Sélectionné</span>
                    )}
                  </span>
                  {canEditAv ? (
                    <AvailabilityButtons
                      size="sm"
                      status={status}
                      onSet={(v) => setGameAvailability(game.id, player.id, v, isOverride(player.id, team.id))}
                      onClear={() => clearGameAvailability(game.id, player.id)}
                    />
                  ) : (
                    <AvailabilityPills size="sm" status={status} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Shortcuts, in the native app's order. "Feuille de match" is app-only
          for now and is deliberately absent rather than stubbed. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {canEditSel && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
          >
            <span className="font-medium text-slate-800">Composer l'équipe</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`text-sm font-semibold ${compoOk ? 'text-green-700' : 'text-amber-600'}`}>
                {selectedIds.length}/{playersPerGame}
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowingSheet(true)}
          className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
        >
          <span className="font-medium text-slate-800">Feuille de match</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
        </button>
        <Link
          to={`/equipes/${team.id}`}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
        >
          <span className="font-medium text-slate-800">Tous les matchs de l'équipe</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
        </Link>
      </div>

      {showingSheet && (
        <MatchSheetView
          matchup={isHome ? `${getTeamLabel(team.id)} – ${getTeamLabel(opponentId)}` : `${getTeamLabel(opponentId)} – ${getTeamLabel(team.id)}`}
          clubName={clubs.find((c) => c.id === team.clubId)?.displayName ?? ''}
          affiliationNumber={clubs.find((c) => c.id === team.clubId)?.affiliationNumber}
          players={lineUp}
          isHome={isHome}
          onClose={() => setShowingSheet(false)}
        />
      )}

      {composing && (
        <SelectionSheet
          teamLabel={getTeamLabel(team.id)}
          playersPerGame={playersPerGame}
          roster={roster}
          others={eligibleOthers}
          initialSelection={selectedIds}
          availabilityOf={(playerId) => getAvailability(game.id, playerId)}
          committedElsewhere={committedElsewhere}
          onSave={(playerIds) => setGameSelection(game.id, team.id, playerIds)}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  )
}
