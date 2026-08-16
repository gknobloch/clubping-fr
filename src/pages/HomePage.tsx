import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { IdentityCard } from '@/components/IdentityCard'
import { ClubLogo } from '@/components/ClubLogo'
import { TeamBadge } from '@/components/TeamBadge'
import { GameQuickView } from '@/components/GameQuickView'
import { PlayerPhaseHistory } from '@/components/PlayerPhaseHistory'
import { SelectionSheet } from '@/components/SelectionSheet'
import { AvailabilityButtons, AvailabilityChip } from '@/components/Availability'
import { HomeIcon, AwayIcon, Pill, PhaseSwitchButton, AlertIcon, ChevronRightIcon } from '@/components/icons'
import { useMatchDayEditing } from '@/lib/useMatchDayEditing'
import { getTeamName } from '@/lib/teamName'
import { getVenue } from '@/lib/venue'
import { sortByName } from '@/lib/sortByName'
import { gameDate, playersCommittedElsewhere } from '@/lib/matchdays'
import type { AvailabilityStatus, Team } from '@/types'

export function HomePage() {
  const { user, displayName, roleLabel } = useAuth()
  const {
    clubs, seasons, teams, players, phases, divisions, groups,
    matchDays, games, gameAvailabilities, gameSelections,
    setGameAvailability, clearGameAvailability, setGameSelection,
  } = useAppData()
  const [quickGame, setQuickGame] = useState<{ gameId: string; teamId: string } | null>(null)
  const [matchIndex, setMatchIndex] = useState(0)
  const [composing, setComposing] = useState(false)

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

  const { canEditGameSelection, isEligibleForTeam } = useMatchDayEditing(activePhase?.id ?? null)

  const statusOf = (gameId: string, playerId: string): AvailabilityStatus | undefined =>
    gameAvailabilities.find((a) => a.gameId === gameId && a.playerId === playerId)?.status

  const teamRoster = useMemo(
    () =>
      sortByName(
        (myActiveTeam?.playerIds ?? []).map((pid) => players.find((p) => p.id === pid)).filter(Boolean) as typeof players,
      ),
    [myActiveTeam, players],
  )

  // "Matchs joués x/y" — out of games already played (past), not the whole
  // season, so an upcoming game isn't counted in the denominator (mirrors the
  // native app's Accueil tile).
  const pastTeamGames = useMemo(
    () => teamGames.filter((g) => { const md = mdMap.get(g.matchDayId); return md ? gameDate(g, md) < today : false }),
    [teamGames, mdMap, today],
  )
  const playedTotal = pastTeamGames.length
  const playedCount = myPlayerId && myActiveTeam
    ? pastTeamGames.filter((g) => (gameSelections.find((s) => s.gameId === g.id && s.teamId === myActiveTeam.id)?.playerIds ?? []).includes(myPlayerId)).length
    : 0

  const isPlayerDashboard = !!myActiveTeam

  return (
    <div className="space-y-5">
      {/* Welcome / identity — IdentityCard rather than a local copy, so the
          header scale stays the same as every other screen's (#389 review). */}
      <IdentityCard
        leading={
          me ? (
            <Avatar
              playerId={me.id}
              avatarUpdatedAt={me.avatarUpdatedAt}
              firstName={me.firstName}
              lastName={me.lastName}
              sizeClass="h-11 w-11 sm:h-14 sm:w-14"
            />
          ) : undefined
        }
        title={displayName}
        trailing={
          myClub && (
            <ClubLogo clubId={myClub.id} logoUpdatedAt={myClub.logoUpdatedAt} sizeClass="h-11 w-11 sm:h-14 sm:w-14" />
          )
        }
      >
        <p className="text-slate-500">{myClub ? myClub.displayName : roleLabel}</p>
      </IdentityCard>

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
                  const playersPerGame = divisions.find((d) => d.id === myActiveTeam.divisionId)?.playersPerGame ?? 4
                  const availableCount = teamRoster.filter((p) => statusOf(g.id, p.id) === 'available').length
                  const noResponseCount = teamRoster.filter((p) => statusOf(g.id, p.id) === undefined).length
                  const selectedIds = gameSelections.find((s) => s.gameId === g.id && s.teamId === myActiveTeam.id)?.playerIds ?? []
                  const canCompose = canEditGameSelection(myActiveTeam.id)
                  const short = availableCount < playersPerGame
                  const eligibleOthers = players.filter(
                    (p) =>
                      p.clubId === myActiveTeam.clubId &&
                      p.status === 'active' &&
                      !myActiveTeam.playerIds.includes(p.id) &&
                      isEligibleForTeam(p.id, myActiveTeam.id, md.id),
                  )
                  const composeCommittedElsewhere = playersCommittedElsewhere(
                    myActiveTeam.id, md.number, clubTeamsInActivePhase, games, matchDays, gameSelections,
                  )
                  return (
                    <>
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
                        {/* Team-level response summary — the count a captain opens
                            "Aperçu" for today (#385). Amber + alert when the club
                            can't yet field the team. */}
                        <div className="mt-3 flex items-center gap-1.5">
                          {short && <AlertIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                          <p className={`text-xs ${short ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
                            {availableCount} disponible{availableCount !== 1 ? 's' : ''} · {noResponseCount} sans réponse
                          </p>
                        </div>
                        {canCompose && (
                          <button
                            type="button"
                            onClick={() => setComposing(true)}
                            className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                          >
                            <span className="text-sm font-medium text-slate-800">Composer l'équipe</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className={`text-sm font-semibold ${selectedIds.length >= playersPerGame ? 'text-green-700' : 'text-amber-600'}`}>
                                {selectedIds.length}/{playersPerGame}
                              </span>
                              <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                            </span>
                          </button>
                        )}
                      </div>
                      {composing && canCompose && (
                        <SelectionSheet
                          teamLabel={getTeamName(myActiveTeam, clubs)}
                          playersPerGame={playersPerGame}
                          roster={teamRoster}
                          others={eligibleOthers}
                          initialSelection={selectedIds}
                          availabilityOf={(playerId) => statusOf(g.id, playerId)}
                          committedElsewhere={composeCommittedElsewhere}
                          onSave={(playerIds) => setGameSelection(g.id, myActiveTeam.id, playerIds)}
                          onClose={() => setComposing(false)}
                        />
                      )}
                    </>
                  )
                })()
              )}
            </div>
            {/* Two across on a phone; stacked from md: up, sharing the height
                of the match card beside them half and half — otherwise they are
                two tall, near-empty boxes (#389 review). */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1 md:grid-rows-2">
              <div className="flex flex-col gap-3">
                <div className="flex h-7 items-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matchs joués</p>
                </div>
                <div className="flex flex-1 items-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-base font-bold text-slate-800">{playedCount}/{playedTotal}</p>
                </div>
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
