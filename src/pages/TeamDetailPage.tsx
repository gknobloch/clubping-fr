import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { teamPhaseEntries } from '@/lib/teamPhases'
import { gameDate } from '@/lib/matchdays'
import { sortByName } from '@/lib/sortByName'
import { getTeamName } from '@/lib/teamName'
import { Avatar } from '@/components/Avatar'
import { GameQuickView } from '@/components/GameQuickView'
import { IdentityCard } from '@/components/IdentityCard'
import { HomeIcon, AwayIcon, InfoIcon, PhaseSwitchButton } from '@/components/icons'

// Player/captain-facing team detail: identity + a phase switcher paging the
// phases this team (club + number) has played, each showing the roster with
// per-player play-counts and the games. Mirrors the mobile team detail +
// phase-games screens.
export function TeamDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { teams, players, clubs, phases, divisions, matchDays, games, gameSelections } = useAppData()
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const [quickGame, setQuickGame] = useState<{ gameId: string; teamId: string } | null>(null)

  const baseTeam = teams.find((t) => t.id === id)
  const today = new Date().toISOString().slice(0, 10)

  // Phases this team played, chronological for the switcher.
  const ordered = useMemo(
    () =>
      baseTeam
        ? teamPhaseEntries(baseTeam, teams, phases, matchDays, games).sort((a, b) =>
            a.label.localeCompare(b.label),
          )
        : [],
    [baseTeam, teams, phases, matchDays, games],
  )

  // Default to the most recent phase this team has played.
  const fallbackPhaseId = ordered[ordered.length - 1]?.phaseId
  const current = ordered.find((e) => e.phaseId === (phaseId ?? fallbackPhaseId)) ?? ordered[0]
  const idx = ordered.findIndex((e) => e.phaseId === current?.phaseId)

  const team = teams.find((t) => t.id === current?.teamId) ?? baseTeam
  const division = divisions.find((d) => d.id === team?.divisionId)
  const games_ = current?.games ?? []
  const totalGames = games_.length

  // Roster with play-counts + borrowed players (renforts), for the selected phase.
  const { roster, borrowed, playedCount } = useMemo(() => {
    const counts = new Map<string, number>()
    const sels = team ? gameSelections.filter((s) => s.teamId === team.id) : []
    for (const sel of sels) for (const pid of sel.playerIds) counts.set(pid, (counts.get(pid) ?? 0) + 1)
    const rosterIds = new Set(team?.playerIds ?? [])
    const rosterPlayers = sortByName(
      (team?.playerIds ?? []).map((pid) => players.find((p) => p.id === pid)).filter(Boolean) as typeof players,
    )
    const borrowedPlayers = sortByName(
      [...counts.keys()]
        .filter((pid) => !rosterIds.has(pid))
        .map((pid) => players.find((p) => p.id === pid))
        .filter(Boolean) as typeof players,
    )
    return { roster: rosterPlayers, borrowed: borrowedPlayers, playedCount: counts }
  }, [team, gameSelections, players])

  if (!baseTeam || !team) {
    return (
      <div className="space-y-4">
        <Link to="/equipes" className="text-sm font-medium text-accent-600 hover:text-accent-800">
          ← Équipes
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          Équipe introuvable.
        </div>
      </div>
    )
  }

  const memberCount = roster.length + borrowed.length

  return (
    <div className="space-y-5">
      <Link to="/equipes" className="text-sm font-medium text-accent-600 hover:text-accent-800">
        ← Équipes
      </Link>

      {/* Identity */}
      <IdentityCard
        leading={
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: team.color ?? '#e23b3b' }}
          >
            {team.number}
          </span>
        }
        title={getTeamName(team, clubs)}
      >
        {division && <p className="text-slate-500">{division.displayName}</p>}
      </IdentityCard>

      {/* Phase switcher */}
      {current && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <PhaseSwitchButton
            dir="prev"
            disabled={idx <= 0}
            onClick={() => idx > 0 && setPhaseId(ordered[idx - 1].phaseId)}
          />
          <span className="font-display text-sm font-semibold text-slate-800">{current.label}</span>
          <PhaseSwitchButton
            dir="next"
            disabled={idx >= ordered.length - 1}
            onClick={() => idx < ordered.length - 1 && setPhaseId(ordered[idx + 1].phaseId)}
          />
        </div>
      )}

      {/* Players (left) / Games (right) — stacked on narrow viewports */}
      <div className="grid gap-5 lg:grid-cols-2">
        {memberCount > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Joueurs
            </h2>
            <ul>
              {roster.map((p) => (
                <RosterRow
                  key={p.id}
                  player={p}
                  captain={p.id === team.captainId}
                  played={playedCount.get(p.id) ?? 0}
                  total={totalGames}
                />
              ))}
              {borrowed.map((p) => (
                <RosterRow
                  key={p.id}
                  player={p}
                  renfort
                  played={playedCount.get(p.id) ?? 0}
                  total={totalGames}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Matchs
          </h2>
          {totalGames === 0 ? (
            <p className="px-5 pb-4 text-sm text-slate-400">Aucun match.</p>
          ) : (
            <ul className="px-5 pb-2">
              {games_.map((g) => {
                const md = g.matchDay
                const isHome = g.homeTeamId === team.id
                const opp = teams.find((t) => t.id === (isHome ? g.awayTeamId : g.homeTeamId))
                const date = md ? gameDate(g, md) : null
                const isPast = date ? date < today : false
                const dateLabel = date
                  ? new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                  : ''
                return (
                  <li key={g.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5">
                    <div className="flex h-7 min-w-0 items-center gap-2">
                      {md && (
                        <span className={`w-6 text-xs font-bold ${isPast ? 'text-slate-500' : 'text-accent-600'}`}>
                          J{md.number}
                        </span>
                      )}
                      <span className="text-slate-500" title={isHome ? 'Domicile' : 'Extérieur'}>
                        {isHome ? <HomeIcon /> : <AwayIcon />}
                      </span>
                      <span className="truncate text-sm text-slate-800">
                        {opp ? getTeamName(opp, clubs) : '—'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-slate-500">{dateLabel}</span>
                      <button
                        type="button"
                        onClick={() => setQuickGame({ gameId: g.id, teamId: team.id })}
                        className="text-slate-300 hover:text-accent-600"
                        title="Détails du match"
                        aria-label="Détails du match"
                      >
                        <InfoIcon />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {quickGame && (
        <GameQuickView
          gameId={quickGame.gameId}
          teamId={quickGame.teamId}
          onClose={() => setQuickGame(null)}
        />
      )}
    </div>
  )
}

function RosterRow({
  player,
  captain,
  renfort,
  played,
  total,
}: {
  player: { id: string; firstName: string; lastName: string; avatarUpdatedAt?: string }
  captain?: boolean
  renfort?: boolean
  played: number
  total: number
}) {
  return (
    <li className="flex items-center gap-3 border-t border-slate-100 px-5 py-2.5">
      <Link to={`/joueurs/${player.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent-600">
        <Avatar
          playerId={player.id}
          avatarUpdatedAt={player.avatarUpdatedAt}
          firstName={player.firstName}
          lastName={player.lastName}
          size={28}
        />
        <span className="truncate text-sm text-slate-800">
          {player.firstName} {player.lastName}
        </span>
      </Link>
      {captain && (
        <span className="rounded-md bg-accent-50 px-1.5 py-0.5 text-xs font-semibold text-accent-600">Cap.</span>
      )}
      {renfort && (
        <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-500">
          Renfort
        </span>
      )}
      <span className="w-10 text-right text-sm font-semibold text-slate-500">
        {played}/{total}
      </span>
    </li>
  )
}
