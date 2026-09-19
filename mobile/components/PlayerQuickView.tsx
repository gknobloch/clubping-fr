import { useAppData } from '@/contexts/DataContext'
import { PlayerSheet } from '@/components/PlayerSheet'
import { playerPhaseHistory } from '@/utils/playerHistory'
import { gameDate } from '@/utils/matchdays'
import { todayIso } from '@/utils/weeks'
import { computeBrulage } from '@shared/lib/brulage'
import { pointsFor } from '@shared/lib/phasePoints'
import type { Team } from '@shared/types'

// ---------------------------------------------------------------------------
// L'aperçu d'un licencié, monté une fois (#585)
//
// The sheet a name opens, wherever the name is printed. Five screens were
// assembling its half-dozen props themselves — the fiche d'équipe, l'écran de
// match, «tous les matchs», la matrice, et maintenant l'accueil — each from the
// same store and each with its own small drift.
//
// So the caller says the two things only it knows: **which licensee**, and **in
// whose company** — the team whose screen the name was read on, if any. The
// rest is derived here, from the one store, so an aperçu cannot say one thing
// on one screen and something else on the next.
// ---------------------------------------------------------------------------
export function PlayerQuickView({
  playerId,
  team = null,
  phaseId,
  phaseLabel,
  onClose,
  showProfile,
}: {
  playerId: string
  /**
   * The team in whose company the name was read. Null for «Autres joueurs du
   * club», who are in no roster — the sheet takes that, and says less.
   */
  team?: Team | null
  /** The phase in view; `team`'s own when there is a team. */
  phaseId?: string
  /** «Saison 2026/2027 Phase 1» — derived from the phase when not given. */
  phaseLabel?: string
  onClose: () => void
  /** Voir `PlayerSheet` : faux là où partir abandonnerait un travail en cours. */
  showProfile?: boolean
}) {
  const {
    players, teams, clubs, phases, matchDays, games, gameSelections, playerPhasePoints,
  } = useAppData()

  const player = players.find((p) => p.id === playerId)
  if (!player) return null

  // Without a team the licensee's own club answers: «Autres joueurs du club»
  // is the club's, and brûlage is a fact about the club's teams either way.
  const clubId = team?.clubId ?? player.clubId
  const inPhase = phaseId ?? team?.phaseId
  const clubTeamsInPhase = teams.filter((t) => t.clubId === clubId && t.phaseId === inPhase)

  const history = playerPhaseHistory({
    playerId: player.id,
    clubTeamsInPhase,
    matchDays,
    games,
    gameSelections,
    teams,
    clubs,
  })

  const burnedIntoId = computeBrulage(
    player.id, clubTeamsInPhase, matchDays, games, gameSelections,
  ).burnedIntoTeamId

  const today = todayIso()
  // Played, not scheduled: «3 / 7» is what the season has asked of them so far.
  const gamesTotal = team
    ? games.filter((g) => {
        if (g.homeTeamId !== team.id && g.awayTeamId !== team.id) return false
        const md = matchDays.find((m) => m.id === g.matchDayId)
        return !!md && gameDate(g, md) < today
      }).length
    : undefined

  const phase = phases.find((p) => p.id === inPhase)

  return (
    <PlayerSheet
      player={player}
      phaseLabel={phaseLabel ?? (phase ? `Saison ${phase.displayName}` : undefined)}
      phasePoints={inPhase ? pointsFor(playerPhasePoints, inPhase, player.id) || undefined : undefined}
      gamesPlayed={history.filter((e) => e.isPast).length}
      gamesTotal={gamesTotal}
      team={team}
      brulageTeam={burnedIntoId ? teams.find((t) => t.id === burnedIntoId) ?? null : null}
      history={history}
      onClose={onClose}
      showProfile={showProfile}
    />
  )
}
