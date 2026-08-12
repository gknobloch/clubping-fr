import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { TeamBadge } from '@/components/TeamBadge'
import { AvailabilityButtons, AvailabilityPills } from '@/components/Availability'
import { Pill } from '@/components/icons'
import { ModalShell } from '@/components/ModalShell'
import { getTeamName } from '@/lib/teamName'
import { getVenue } from '@/lib/venue'
import { gameDate, playersCommittedElsewhere } from '@/lib/matchdays'
import { TEXT_TARGET_CLASS } from '@/components/Button'

// Read-only quick view of a single game from one team's perspective — match
// header + availabilities / line-up. Mirrors the mobile match detail screen
// (mobile/app/(tabs)/(detail)/match/[id].tsx) without the editing controls.
export function GameQuickView({
  gameId,
  teamId,
  onClose,
}: {
  gameId: string
  teamId: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const {
    clubs, teams, players, groups, divisions, matchDays, games,
    gameAvailabilities, gameSelections,
    setGameAvailability, clearGameAvailability,
  } = useAppData()
  const myPlayerId = user?.isPlayer ? user.id : undefined

  const game = games.find((g) => g.id === gameId)
  const team = teams.find((t) => t.id === teamId)
  const matchDay = game ? matchDays.find((md) => md.id === game.matchDayId) : undefined

  const roster = useMemo(
    () =>
      team
        ? (team.playerIds.map((pid) => players.find((p) => p.id === pid)).filter(Boolean) as typeof players)
            .slice()
            .sort((a, b) =>
              a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' }) ||
              a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' }),
            )
        : [],
    [team, players],
  )

  // Players selected for another of the club's teams on this same round number.
  const committed = useMemo(() => {
    if (!team || !matchDay) return new Map<string, number>()
    const clubTeams = teams.filter((t) => t.clubId === team.clubId && t.phaseId === team.phaseId)
    return playersCommittedElsewhere(team.id, matchDay.number, clubTeams, games, matchDays, gameSelections)
  }, [team, matchDay, teams, games, matchDays, gameSelections])

  if (!game || !team || !matchDay) return null

  const date = gameDate(game, matchDay)
  const isPast = date < new Date().toISOString().slice(0, 10)
  const isHome = game.homeTeamId === team.id
  const oppTeam = teams.find((t) => t.id === (isHome ? game.awayTeamId : game.homeTeamId))
  const opponentName = oppTeam ? getTeamName(oppTeam, clubs) : '?'
  const group = groups.find((g) => g.id === team.groupId)
  const division = group ? divisions.find((d) => d.id === group.divisionId) : undefined

  const homeTeam = teams.find((t) => t.id === game.homeTeamId)
  const venue = getVenue(homeTeam, clubs)

  const selection = gameSelections.find((s) => s.teamId === team.id && s.gameId === game.id)?.playerIds ?? []
  const rosterIds = new Set(roster.map((p) => p.id))
  const borrowed = selection
    .filter((pid) => !rosterIds.has(pid))
    .map((pid) => players.find((p) => p.id === pid))
    .filter(Boolean) as typeof players
  const availOf = (pid: string) =>
    gameAvailabilities.find((a) => a.playerId === pid && a.gameId === game.id)?.status

  const matchup = isHome ? `${getTeamName(team, clubs)} – ${opponentName}` : `${opponentName} – ${getTeamName(team, clubs)}`
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      label="Détails du match"
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>J{matchDay.number}</Pill>
          {division && <Pill>{division.displayName}</Pill>}
          <Link to={`/equipes/${team.id}`} className={`hover:opacity-80 ${TEXT_TARGET_CLASS}`} onClick={onClose} title="Voir la fiche équipe">
            <TeamBadge color={team.color} label={`Équipe ${team.number}`} />
          </Link>
        </div>
        <h2 className="mt-2 font-display text-lg font-semibold text-slate-800">{matchup}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {dateLabel}
          {game.time ? ` · ${game.time}` : ''}
          {venue ? ` · ${venue}` : ''}
        </p>

        {/* Availabilities + line-up */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Disponibilités
        </h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {roster.map((p) => {
            const selected = selection.includes(p.id)
            const lockedTeam = !selected ? committed.get(p.id) : undefined
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  to={`/joueurs/${p.id}`}
                  onClick={onClose}
                  className={`flex min-w-0 items-center gap-2 hover:opacity-80 ${TEXT_TARGET_CLASS}`}
                >
                  <Check on={selected} />
                  <span className={`truncate text-sm ${selected ? 'font-semibold text-accent-600' : 'text-slate-800'}`}>
                    {p.firstName} {p.lastName}
                  </span>
                </Link>
                {lockedTeam !== undefined ? (
                  <span className="shrink-0 text-xs italic text-slate-500">Joue en Équipe {lockedTeam}</span>
                ) : p.id === myPlayerId && !isPast ? (
                  <AvailabilityButtons
                    size="sm"
                    status={availOf(p.id)}
                    onSet={(s) => setGameAvailability(game.id, p.id, s)}
                    onClear={() => clearGameAvailability(game.id, p.id)}
                  />
                ) : (
                  <AvailabilityPills status={availOf(p.id)} />
                )}
              </li>
            )
          })}
          {borrowed.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link
                to={`/joueurs/${p.id}`}
                onClick={onClose}
                className={`flex min-w-0 items-center gap-2 hover:opacity-80 ${TEXT_TARGET_CLASS}`}
              >
                <Check on />
                <span className="truncate text-sm font-semibold text-accent-600">
                  {p.firstName} {p.lastName}
                </span>
              </Link>
              <span className="shrink-0 text-xs italic text-slate-500">Renfort</span>
            </li>
          ))}
        </ul>

        {/* Two columns: the way out and the way on are peers, and stacked they
            pushed the roster off a phone screen. */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-100 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Fermer
          </button>

          {/* Everyone gets this, not just whoever may edit the line-up: reading
              a round is reading, and both destinations gate their own controls
              (#347).

              Two links, one per breakpoint, because the right destination
              differs — the same split the Journées screen itself makes, and a
              `hidden` element is not a grid item, so exactly one occupies the
              second column at any width.

              Below md: the single-match screen (#337), which is the phone
              answer to a matrix that cannot fit 375px.
              From md up: the matrix, deep-linked via `equipe` + `match` so it
              lands on the team, slides its window onto this journée and rings
              the fixture. */}
          <Link
            to={`/journees/${game.id}?equipe=${team.id}`}
            onClick={onClose}
            className="w-full rounded-lg bg-accent-600 py-2.5 text-center text-sm font-medium text-white hover:bg-accent-700 md:hidden"
          >
            Détails
          </Link>
          <Link
            to={`/journees?equipe=${team.id}&match=${game.id}`}
            onClick={onClose}
            className="hidden w-full rounded-lg bg-accent-600 py-2.5 text-center text-sm font-medium text-white hover:bg-accent-700 md:block"
          >
            Détails
          </Link>
        </div>
      </div>
    </ModalShell>
  )
}

function Check({ on }: { on?: boolean }) {
  if (!on) return <span className="h-4 w-4 shrink-0" aria-hidden="true" />
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white" aria-label="Sélectionné">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}
