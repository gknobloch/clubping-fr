import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import { TeamBadge } from '@/components/TeamBadge'
import { GameQuickView } from '@/components/GameQuickView'
import { PlayerPhaseHistory } from '@/components/PlayerPhaseHistory'
import { AvailabilityButtons, AvailabilityChip } from '@/components/Availability'
import { HomeIcon, AwayIcon, Pill, PhaseSwitchButton } from '@/components/icons'
import { getTeamName } from '@/lib/teamName'
import { getVenue } from '@/lib/venue'
import { gameDate, playersCommittedElsewhere } from '@/lib/matchdays'
import type { AvailabilityStatus, Team } from '@/types'

export function HomePage() {
  const { user, displayName, roleLabel } = useAuth()
  const {
    clubs, seasons, teams, players, phases, divisions, groups,
    matchDays, games, gameAvailabilities, gameSelections,
    setGameAvailability, clearGameAvailability,
  } = useAppData()
  const [quickGame, setQuickGame] = useState<{ gameId: string; teamId: string } | null>(null)
  const [matchIndex, setMatchIndex] = useState(0)

  const today = new Date().toISOString().slice(0, 10)
  const myPlayerId = user?.isPlayer ? user.id : undefined
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const myClub = clubs.find((c) => c.id === (me?.clubId ?? user?.clubId))

  const activeSeason = seasons.find((s) => s.status === 'active')
  const activePhase = phases.find((p) => p.status === 'active')
  const myActiveTeam = useMemo(
    () =>
      myPlayerId && activePhase
        ? teams.find((t) => t.phaseId === activePhase.id && t.playerIds.includes(myPlayerId))
        : undefined,
    [teams, activePhase, myPlayerId],
  )

  const mdMap = useMemo(() => new Map(matchDays.map((md) => [md.id, md])), [matchDays])

  const teamGames = useMemo(
    () =>
      myActiveTeam
        ? games.filter((g) => g.homeTeamId === myActiveTeam.id || g.awayTeamId === myActiveTeam.id)
        : [],
    [games, myActiveTeam],
  )
  const upcoming = useMemo(() => {
    const dateOf = (g: (typeof teamGames)[number]) => { const md = mdMap.get(g.matchDayId); return md ? gameDate(g, md) : null }
    return teamGames
      .filter((g) => { const d = dateOf(g); return d !== null && d >= today })
      .sort((a, b) => (dateOf(a) ?? '').localeCompare(dateOf(b) ?? ''))
  }, [teamGames, mdMap, today])

  const availOf = (gameId: string): AvailabilityStatus | undefined =>
    myPlayerId ? gameAvailabilities.find((a) => a.playerId === myPlayerId && a.gameId === gameId)?.status : undefined

  const toConfirm = upcoming.filter((g) => availOf(g.id) === undefined).length

  const divisionOf = (team: Team) => {
    const grp = groups.find((g) => g.id === team.groupId)
    return grp ? divisions.find((d) => d.id === grp.divisionId)?.displayName : undefined
  }

  const clubTeamsInActivePhase = useMemo(
    () =>
      myActiveTeam && activePhase
        ? teams.filter((t) => t.clubId === myActiveTeam.clubId && t.phaseId === activePhase.id)
        : [],
    [teams, myActiveTeam, activePhase],
  )

  // Team number this player is already committed to on a game's round (so they
  // can't set availability for this team) — else undefined.
  const committedElsewhere = (gameId: string): number | undefined => {
    if (!myPlayerId || !myActiveTeam) return undefined
    const md = mdMap.get(games.find((g) => g.id === gameId)?.matchDayId ?? '')
    if (!md) return undefined
    return playersCommittedElsewhere(myActiveTeam.id, md.number, clubTeamsInActivePhase, games, matchDays, gameSelections).get(myPlayerId)
  }

  const isPlayerDashboard = !!myActiveTeam

  return (
    <div className="space-y-5">
      {/* Welcome / identity */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {me ? (
          <Avatar playerId={me.id} avatarUpdatedAt={me.avatarUpdatedAt} firstName={me.firstName} lastName={me.lastName} size={56} />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-slate-800">
            {displayName}
          </h1>
          <p className="text-slate-500">{myClub ? myClub.displayName : roleLabel}</p>
        </div>
        {myClub && <ClubLogo clubId={myClub.id} logoUpdatedAt={myClub.logoUpdatedAt} size={56} />}
      </div>

      {isPlayerDashboard && myActiveTeam ? (
        <>
          {/* Upcoming matches — set your availability inline; à confirmer count on the side */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex h-7 items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prochains matchs</p>
                {upcoming.length > 1 && (
                  <div className="flex items-center gap-1">
                    <PhaseSwitchButton
                      dir="prev"
                      disabled={matchIndex <= 0}
                      onClick={() => setMatchIndex((i) => Math.max(0, i - 1))}
                      prevLabel="Match précédent"
                    />
                    <span className="text-xs font-medium text-slate-400">
                      {Math.min(matchIndex, upcoming.length - 1) + 1}/{upcoming.length}
                    </span>
                    <PhaseSwitchButton
                      dir="next"
                      disabled={matchIndex >= upcoming.length - 1}
                      onClick={() => setMatchIndex((i) => Math.min(upcoming.length - 1, i + 1))}
                      nextLabel="Match suivant"
                    />
                  </div>
                )}
              </div>
              {upcoming.length === 0 ? (
                <div className="flex flex-1 items-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-base font-bold text-slate-800">Pas de prochain match prévu</p>
                </div>
              ) : (
                (() => {
                  const g = upcoming[Math.min(matchIndex, upcoming.length - 1)]
                  const md = mdMap.get(g.matchDayId)!
                  const isHome = g.homeTeamId === myActiveTeam.id
                  const opp = teams.find((t) => t.id === (isHome ? g.awayTeamId : g.homeTeamId))
                  const homeTeam = teams.find((t) => t.id === g.homeTeamId)
                  const matchup = isHome
                    ? `${getTeamName(myActiveTeam, clubs)} – ${opp ? getTeamName(opp, clubs) : '?'}`
                    : `${opp ? getTeamName(opp, clubs) : '?'} – ${getTeamName(myActiveTeam, clubs)}`
                  const dateLabel = new Date(gameDate(g, md) + 'T12:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })
                  const locked = committedElsewhere(g.id)
                  return (
                    <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill>J{md.number}</Pill>
                        {divisionOf(myActiveTeam) && <Pill>{divisionOf(myActiveTeam)}</Pill>}
                        <TeamBadge color={myActiveTeam.color} label={`Équipe ${myActiveTeam.number}`} />
                      </div>
                      <h2 className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-slate-800">
                        <span className="text-slate-400">{isHome ? <HomeIcon className="h-4 w-4" /> : <AwayIcon className="h-4 w-4" />}</span>
                        {matchup}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {dateLabel}{g.time ? ` · ${g.time}` : ''}{getVenue(homeTeam, clubs) ? ` · ${getVenue(homeTeam, clubs)}` : ''}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        {locked !== undefined ? (
                          <span className="text-xs italic text-slate-500">Joue en Équipe {locked}</span>
                        ) : myPlayerId ? (
                          <AvailabilityButtons
                            status={availOf(g.id)}
                            onSet={(s) => setGameAvailability(g.id, myPlayerId, s)}
                            onClear={() => clearGameAvailability(g.id, myPlayerId)}
                          />
                        ) : (
                          <AvailabilityChip status={availOf(g.id)} />
                        )}
                        <button
                          type="button"
                          onClick={() => setQuickGame({ gameId: g.id, teamId: myActiveTeam.id })}
                          className={`shrink-0 text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
                        >
                          {/* "Aperçu": this opens the quick view, and "Détails"
                              now names the button inside it that goes to the
                              real thing. */}
                          Aperçu
                        </button>
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex h-7 items-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">À confirmer</p>
              </div>
              <div className="flex flex-1 items-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className={`text-base font-bold ${toConfirm > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                  {toConfirm} match{toConfirm !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Generic view for non-players (admins) */
        <>
          {activeSeason && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saison en cours</h2>
              <p className="mt-1 text-lg font-semibold text-slate-800">{activeSeason.displayName}</p>
            </section>
          )}
          {(() => {
            const next = matchDays
              .filter((md) => md.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 3)
            if (next.length === 0) return null
            return (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prochaines journées
                </h2>
                <ul>
                  {next.map((md) => {
                    const count = games.filter((g) => g.matchDayId === md.id).length
                    return (
                      <li key={md.id} className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">Journée {md.number}</span>
                          <span className="block text-xs text-slate-500">
                            {new Date(md.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                        </span>
                        <span className="text-sm text-slate-500">{count} match{count > 1 ? 's' : ''}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })()}
        </>
      )}

      {/* Match history — one phase (season) at a time via the switcher (#233),
          defaulting to the active one. */}
      {myPlayerId && <PlayerPhaseHistory playerId={myPlayerId} title="Tous mes matchs" />}

      {quickGame && (
        <GameQuickView gameId={quickGame.gameId} teamId={quickGame.teamId} onClose={() => setQuickGame(null)} />
      )}
    </div>
  )
}
