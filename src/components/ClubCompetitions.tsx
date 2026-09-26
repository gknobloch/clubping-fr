import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { useConfirm } from '@/components/useConfirm'
import { sortByName } from '@/lib/sortByName'
import { activeSeasonId } from '@/lib/season'
import { withSeasonCategory } from '@/lib/seasonCategories'
import { categoriesSummary, categoryDisplay } from '@/lib/playerCategories'
import {
  ELIGIBILITY_REASON_LABELS,
  competitionGroupOf,
  competitionRoster,
  isPlayerEligible,
  type EligiblePlayer,
} from '@/lib/competitionEligibility'
import { assignmentSummary, assignmentsByPlayer } from '@/lib/competitionAssignments'
import { clubMemberGroups, mayManageMemberGroups } from '@/lib/memberGroups'
import type { Competition, MemberGroup } from '@/types'

/**
 * A club's competitions, and the group each one is reserved to (#604).
 *
 * It replaced a licensee-by-licensee list of exclusions and additions (#482):
 * one choice per competition now, made from the club's own groups (#602), and
 * the club keeps its groups up to date once for everything it uses them for.
 *
 * The rule is the competition's categories AND the group: a group can only
 * narrow, never admit a category the competition refuses. What each card lists
 * follows from it — who is eligible, and, greyed, whoever the club put in the
 * group but the categories turn away.
 *
 * On both club screens, like `ClubAdmins`: a club admin on /competitions, a
 * general admin on /clubs/:id.
 */
export function ClubCompetitions({
  clubId,
  idPrefix = 'club',
  variant = 'panel',
}: {
  clubId: string
  idPrefix?: string
  /** Which page's furniture to wear — see ClubAdmins for why this exists. */
  variant?: 'panel' | 'section'
}) {
  const { user } = useAuth()
  const {
    competitions, players, teams, divisions, gameSelections, playerSeasonCategories, seasons,
    memberGroups, competitionGroups, setCompetitionGroup,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()

  // Reserving a competition is choosing among the club's groups, so it is
  // theirs to do who manage those groups: the club's admins, and a general admin.
  const canManage = mayManageMemberGroups(user, clubId)
  const groups = clubMemberGroups(memberGroups, clubId)

  const available = useMemo(
    () => competitions.filter((c) => !c.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    [competitions],
  )

  // The category is a fact about a season (#482); the one that decides who may
  // play is the season being played.
  const seasonId = activeSeasonId(seasons)
  const clubPlayers = useMemo(
    () => withSeasonCategory(
      sortByName(players.filter((p) => p.clubId === clubId && p.status === 'active')),
      playerSeasonCategories,
      seasonId,
    ),
    [players, clubId, playerSeasonCategories, seasonId],
  )
  const clubTeams = useMemo(() => teams.filter((t) => t.clubId === clubId), [teams, clubId])

  /**
   * Choosing a group can leave a licensee an équipe already fields outside it.
   * Nothing is taken off a team or a line-up — eligibility bites on what can be
   * added — so the question says exactly that, and names them (#482's rule).
   */
  const choose = async (competition: Competition, groupId: string | null) => {
    const group = groups.find((g) => g.id === groupId)
    if (group) {
      const engaged = assignmentsByPlayer(competition.id, {
        teams: clubTeams, divisions, competitions, gameSelections,
      })
      const leaving = clubPlayers.filter(
        (p) => engaged.has(p.id) && !isPlayerEligible(p, competition, group),
      )
      if (leaving.length > 0 && !(await confirm({
        title: `Réserver « ${competition.displayName} » au groupe « ${group.displayName} » ?`,
        message: `${leaving.length === 1 ? 'Un licencié que vos équipes engagent déjà n’est pas' : `${leaving.length} licenciés que vos équipes engagent déjà ne sont pas`} dans ce groupe : ${leaving.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}. Rien ne les retire d'une équipe ni d'une composition ; ils ne seront simplement plus proposés ailleurs.`,
        confirmLabel: 'Réserver',
        tone: 'accent',
      }))) return
    }
    setCompetitionGroup(clubId, competition.id, groupId)
  }

  const isSection = variant === 'section'

  return (
    <section
      aria-labelledby={`${idPrefix}-competitions-title`}
      className={
        isSection
          ? 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
          : 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
      }
    >
      {isSection ? (
        <h3
          id={`${idPrefix}-competitions-title`}
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Compétitions
        </h3>
      ) : (
        <h2 id={`${idPrefix}-competitions-title`} className="font-display text-lg font-semibold text-slate-800">
          Compétitions
        </h2>
      )}

      {available.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Aucune compétition n'est définie. Tous les licenciés du club restent proposés partout.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Chaque compétition admet certaines catégories. Le club peut la réserver à l'un de ses
            groupes : seuls ses membres de ces catégories y sont alors proposés.
          </p>
          {canManage && groups.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">
              Le club n'a encore aucun groupe.{' '}
              <Link to="/club" className="font-medium text-accent-600 hover:text-accent-800">
                Créer des groupes
              </Link>
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {available.map((competition) => (
              <CompetitionCard
                key={competition.id}
                idPrefix={`${idPrefix}-${competition.id}`}
                competition={competition}
                group={competitionGroupOf(clubId, competition.id, competitionGroups, memberGroups)}
                groups={groups}
                players={clubPlayers}
                engaged={assignmentsByPlayer(competition.id, {
                  teams: clubTeams, divisions, competitions, gameSelections,
                })}
                canManage={canManage}
                onChoose={(groupId) => choose(competition, groupId)}
              />
            ))}
          </ul>
        </>
      )}
      {confirmDialog}
    </section>
  )
}

function CompetitionCard({
  idPrefix,
  competition,
  group,
  groups,
  players,
  engaged,
  canManage,
  onChoose,
}: {
  idPrefix: string
  competition: Competition
  group: MemberGroup | undefined
  groups: MemberGroup[]
  players: Array<EligiblePlayer & { firstName: string; lastName: string }>
  engaged: ReturnType<typeof assignmentsByPlayer>
  canManage: boolean
  onChoose: (groupId: string | null) => void
}) {
  const { eligible, outOfCategory } = competitionRoster(players, competition, group)
  const eligibleIds = new Set(eligible.map((p) => p.id))
  // Fielded already, and no longer admitted: the contradiction a club has to
  // settle itself, since nothing is ever taken off a team (#482).
  const conflicts = players.filter((p) => engaged.has(p.id) && !eligibleIds.has(p.id))
  const noneLabel = competition.categories.length === 0
    ? 'Aucun — tous les licenciés'
    : 'Aucun — tous les licenciés de ces catégories'

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <p className="font-medium text-slate-800">{competition.displayName}</p>
      <p className="text-xs text-slate-500">Catégories : {categoriesSummary(competition.categories)}</p>

      <div className="mt-3">
        <label htmlFor={`${idPrefix}-group`} className="block text-sm font-medium text-slate-700">
          Réservée au groupe
        </label>
        {canManage ? (
          <select
            id={`${idPrefix}-group`}
            value={group?.id ?? ''}
            onChange={(e) => onChoose(e.target.value || null)}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0 md:max-w-sm"
          >
            <option value="">{noneLabel}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.displayName}</option>
            ))}
          </select>
        ) : (
          <p id={`${idPrefix}-group`} className="mt-1 text-sm text-slate-600">
            {group?.displayName ?? noneLabel}
          </p>
        )}
      </div>

      {conflicts.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">⚠ Engagés mais plus éligibles</p>
          <ul className="mt-1 space-y-0.5">
            {conflicts.map((p) => (
              <li key={p.id}>
                {p.firstName} {p.lastName} — {assignmentSummary(engaged.get(p.id))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-3 group">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent-600 md:min-h-0">
          {eligible.length} joueur{eligible.length > 1 ? 's' : ''} éligible{eligible.length > 1 ? 's' : ''}
          {outOfCategory.length > 0 && ` · ${outOfCategory.length} hors catégorie`}
        </summary>
        <ul className="mt-2 divide-y divide-slate-100">
          {eligible.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <Link to={`/joueurs/${p.id}`} className="truncate text-slate-800 hover:text-accent-600">
                {p.firstName} {p.lastName}
              </Link>
              <span className="shrink-0 text-xs text-slate-500">{categoryDisplay(p.category)}</span>
            </li>
          ))}
          {/* In the group, turned away by the categories: greyed, and why. */}
          {outOfCategory.map(({ player: p, reason }) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm text-slate-400">
              <Link to={`/joueurs/${p.id}`} className="truncate hover:text-accent-600">
                {p.firstName} {p.lastName}
              </Link>
              <span className="shrink-0 text-xs">
                {categoryDisplay(p.category) || '—'} · {ELIGIBILITY_REASON_LABELS[reason]}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}
