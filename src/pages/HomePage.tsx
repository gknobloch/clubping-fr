import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { IdentityCard } from '@/components/IdentityCard'
import { ClubLogo } from '@/components/ClubLogo'
import { TeamBadge } from '@/components/TeamBadge'
import { AddToCalendarButton } from '@/components/AddToCalendarButton'
import { MatchDate } from '@/components/MatchDate'
import { GameQuickView } from '@/components/GameQuickView'
import { PlayerPhaseHistory } from '@/components/PlayerPhaseHistory'
import { SelectionSheet } from '@/components/SelectionSheet'
import { AvailabilityButtons, AvailabilityChip, AvailabilityPills, LineupCheck } from '@/components/Availability'
import { HomeIcon, AwayIcon, Pill, PhaseSwitchButton, AlertIcon, ChevronRightIcon } from '@/components/icons'
import { useMatchDayEditing } from '@/lib/useMatchDayEditing'
import { getTeamName } from '@/lib/teamName'
import { getVenue } from '@/lib/venue'
import { sortByName } from '@/lib/sortByName'
import { competitionOfDivision, eligiblePlayers } from '@/lib/competitionEligibility'
import { gameDate, gameTime, isSlotConfirmed, playersCommittedElsewhere, upcomingRounds } from '@/lib/matchdays'
import type { AvailabilityStatus, Team } from '@/types'

/**
 * A round's date line. Its groups rarely play on the same day — the FFTT gives
 * each one its own slot inside the week — so a single date would name one of
 * them and quietly drop the others.
 */
function roundDates({ from, to }: { from: string; to: string }): string {
  const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', opts)
  if (from === to) return day(from, { weekday: 'long', day: 'numeric', month: 'long' })
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  return `du ${day(from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })} au ${day(to, { day: 'numeric', month: 'long' })}`
}

export function HomePage() {
  const { user, displayName, roleLabel } = useAuth()
  const {
    clubs, seasons, teams, players, phases, divisions, groups,
    matchDays, games, gameAvailabilities, gameSelections,
    competitions, competitionEligibilities,
    setGameAvailability, clearGameAvailability, setGameSelection,
  } = useAppData()
  const [quickGame, setQuickGame] = useState<{ gameId: string; teamId: string } | null>(null)
  const [matchIndex, setMatchIndex] = useState(0)
  const [composing, setComposing] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
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

  const { canEditAvailability, canEditGameSelection, isEligibleForTeam, isOverride } =
    useMatchDayEditing(activePhase?.id ?? null)

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
          {/* The next match, full width: from md: up the card splits in two on
              its own — the game on the left, the team's answers on the right —
              so it no longer shares the row with two counters (#461). */}
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
                // The receiving club's time (#287), never this team's own.
                const time = gameTime(g, md, homeTeam)
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
                // Brûlage, then the competition the team's division belongs
                // to (#482): a renfort has to be admitted by both.
                const eligibleOthers = eligiblePlayers(
                  players.filter(
                    (p) =>
                      p.clubId === myActiveTeam.clubId &&
                      p.status === 'active' &&
                      !myActiveTeam.playerIds.includes(p.id) &&
                      isEligibleForTeam(p.id, myActiveTeam.id, md.id),
                  ),
                  competitionOfDivision(myActiveTeam.divisionId, divisions, competitions),
                  competitionEligibilities.filter((e) => e.clubId === myActiveTeam.clubId),
                )
                const composeCommittedElsewhere = playersCommittedElsewhere(
                  myActiveTeam.id, md.number, clubTeamsInActivePhase, games, matchDays, gameSelections,
                )
                return (
                  <>
                    {/* Two halves from md: up — the game and what it asks of
                        me on the left, what everybody else answered on the
                        right. Left is the answer I owe, right the answers I am
                        waiting on, and the rule holds at every width and for
                        every role. Below md: one column, in the order game → my
                        answer → the team, so the control never sits under a
                        list (#461). */}
                    <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex md:items-stretch md:gap-5">
                      <div className="md:w-1/2 md:min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Pill>J{md.number}</Pill>
                          {divisionOf(myActiveTeam) && <Pill>{divisionOf(myActiveTeam)}</Pill>}
                          <TeamBadge color={myActiveTeam.color} label={`Équipe ${myActiveTeam.number}`} />
                        </div>
                        <h2 className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-slate-800">
                          <span className="text-slate-400">{isHome ? <HomeIcon className="h-4 w-4" /> : <AwayIcon className="h-4 w-4" />}</span>
                          {matchup}
                        </h2>
                        {/* The slot, and the icon that blocks it in the
                            player's own agenda (#426): answering OUI and
                            writing the match down are one gesture apart. */}
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-sm text-slate-500">
                            <MatchDate label={dateLabel} confirmed={isSlotConfirmed(g, md, homeTeam)} />
                            {time ? ` · ${time}` : ''}{getVenue(homeTeam, clubs) ? ` · ${getVenue(homeTeam, clubs)}` : ''}
                          </p>
                          <AddToCalendarButton game={g} matchDay={md} team={myActiveTeam} />
                        </div>
                        {/* Labelled now that the team's own answers sit beside
                            it from md: up: two identical OUI / PE / NON
                            triplets in one card, one meaning "me" and the other
                            "everyone", have to say which is which (#461). */}
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ma disponibilité</p>
                          <div className="mt-1" role="group" aria-label="Ma disponibilité">
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
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col md:mt-0 md:w-1/2 md:min-w-0 md:border-l md:border-slate-200 md:pl-5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Disponibilité de l'équipe</p>
                          {noResponseCount > 0 && (
                            <p className="hidden shrink-0 text-xs font-semibold text-amber-600 md:block">
                              {noResponseCount} sans réponse
                            </p>
                          )}
                        </div>

                        {/* Below md: the count, and "Aperçu" to open the list.
                            From md: up the list is right here, so the button has
                            nothing left to open — the same split "Composer
                            l'équipe" makes below, by the same means: two
                            elements, exactly one of them live at any width,
                            rather than a width test in JS (#456). */}
                        <div className="mt-1 flex items-center justify-between gap-3 md:hidden">
                          <div className="flex items-center gap-1.5">
                            {short && <AlertIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                            <p className={`text-xs ${short ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
                              {availableCount} disponible{availableCount !== 1 ? 's' : ''} · {noResponseCount} sans réponse
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setQuickGame({ gameId: g.id, teamId: myActiveTeam.id })}
                            className={`shrink-0 text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
                          >
                            {/* "Aperçu": this opens the quick view, and "Détails"
                                names the button inside it that goes to the real
                                thing. */}
                            Aperçu
                          </button>
                        </div>

                        <ul
                          aria-label="Disponibilité de l'équipe"
                          className="mt-1 hidden divide-y divide-slate-100 md:block"
                        >
                          {teamRoster.map((p) => {
                            const lockedTeam = !selectedIds.includes(p.id)
                              ? composeCommittedElsewhere.get(p.id)
                              : undefined
                            return (
                              <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                                <Link
                                  to={`/joueurs/${p.id}`}
                                  className={`flex min-w-0 items-center gap-2 hover:opacity-80 ${TEXT_TARGET_CLASS}`}
                                >
                                  <LineupCheck on={selectedIds.includes(p.id)} />
                                  <span className={`truncate text-sm ${p.id === myPlayerId ? 'font-semibold text-accent-600' : 'text-slate-800'}`}>
                                    {p.firstName} {p.lastName}
                                  </span>
                                </Link>
                                {/* Answering for someone already fielded on this
                                    round means nothing — the quick view this
                                    column replaces said so, and so does it. */}
                                {lockedTeam !== undefined ? (
                                  <span className="shrink-0 text-xs italic text-slate-500">Joue en Équipe {lockedTeam}</span>
                                ) : canEditAvailability(p.id, myActiveTeam.id) ? (
                                  <AvailabilityButtons
                                    size="sm"
                                    status={statusOf(g.id, p.id)}
                                    onSet={(s) => setGameAvailability(g.id, p.id, s, isOverride(p.id, myActiveTeam.id))}
                                    onClear={() => clearGameAvailability(g.id, p.id)}
                                  />
                                ) : (
                                  <AvailabilityPills size="sm" status={statusOf(g.id, p.id)} />
                                )}
                              </li>
                            )
                          })}
                        </ul>
                        {canCompose && (() => {
                          /* One row, two destinations — the same split
                             GameQuickView's "Détails" makes, and for the same
                             reason (#456).

                             Below md: the sheet, which is the phone's whole
                             answer to composing a line-up (#380, #382).

                             From md up: the Journées matrix, deep-linked so it
                             picks the phase, slides its window onto this
                             journée, scrolls to the team and rings the fixture
                             (#347). At that width the sheet was a full-height
                             list of the club laid over a screen that already
                             does the job better — with the availabilities, the
                             brûlage and the club's other teams in view.

                             Two elements rather than a width test in JS: a
                             `hidden` element simply is not there, so exactly
                             one is live at any width, and nothing has to
                             re-measure on resize.

                             The display utility is left off the shared classes
                             so each element states its own — `flex` and
                             `hidden` in one list would decide by stylesheet
                             order rather than intent. */
                          const rowClass =
                            'mt-3 min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 md:mt-auto md:pt-3'
                          const inner = (
                            <>
                              <span className="text-sm font-medium text-slate-800">Composer l'équipe</span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className={`text-sm font-semibold ${selectedIds.length >= playersPerGame ? 'text-green-700' : 'text-amber-600'}`}>
                                  {selectedIds.length}/{playersPerGame}
                                </span>
                                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                              </span>
                            </>
                          )
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => setComposing(true)}
                                className={`${rowClass} flex md:hidden`}
                              >
                                {inner}
                              </button>
                              <Link
                                to={`/journees?equipe=${myActiveTeam.id}&match=${g.id}`}
                                className={`${rowClass} hidden md:flex`}
                              >
                                {inner}
                              </Link>
                            </>
                          )
                        })()}
                      </div>
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

          {/* Season facts, not match facts: a footer under the card rather than
              a column beside it. One line each from md: up — label at one end,
              figure at the other — and stacked below that, where « Matchs
              joués » and its figure do not fit on one 170pt line (#461). */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm md:flex-row md:items-center md:justify-between md:gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matchs joués</p>
              <p className="text-base font-bold tabular-nums text-slate-800">{playedCount}/{playedTotal}</p>
            </div>
            <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm md:flex-row md:items-center md:justify-between md:gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">À confirmer</p>
              <p className={`text-base font-bold ${toConfirm > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {toConfirm} match{toConfirm !== 1 ? 's' : ''}
              </p>
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
            // Scoped to the club when the viewer has one (#474): a club admin
            // was being shown every club's journées, so a club with no team at
            // all still announced three of them.
            const next = upcomingRounds(matchDays, games, teams, {
              // A general admin oversees every club; anyone else sees their own
              // and nothing else — including nothing at all when their club has
              // no team yet, which is where a fresh onboarding leaves them.
              scope: user?.role === 'general_admin' ? 'all' : { clubId: user?.clubId ?? '' },
              today,
              phaseOf: (md) => divisions.find((d) => d.id === groupById.get(md.groupId)?.divisionId)?.phaseId ?? '',
            })
            if (next.length === 0) return null
            return (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prochaines journées
                </h2>
                <ul>
                  {next.map((round) => (
                    <li key={round.id} className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">Journée {round.number}</span>
                        <span className="block text-xs text-slate-500">{roundDates(round)}</span>
                      </span>
                      <span className="text-sm text-slate-500">
                        {round.games} match{round.games > 1 ? 's' : ''}
                      </span>
                    </li>
                  ))}
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
