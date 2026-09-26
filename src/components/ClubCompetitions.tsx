import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { useConfirm } from '@/components/useConfirm'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { sortByName } from '@/lib/sortByName'
import { activeSeasonId } from '@/lib/season'
import { withSeasonCategory } from '@/lib/seasonCategories'
import { categoriesSummary, categoryDisplay } from '@/lib/playerCategories'
import {
  ELIGIBILITY_REASON_LABELS,
  competitionGroupOf,
  competitionsOfClub,
  isPlayerEligible,
  playerEligibility,
  type EligiblePlayer,
} from '@/lib/competitionEligibility'
import { assignmentSummary, assignmentsByPlayer, type CompetitionAssignment } from '@/lib/competitionAssignments'
import { clubMemberGroups, mayManageMemberGroups } from '@/lib/memberGroups'
import type { Competition, MemberGroup } from '@/types'

type ClubPlayer = EligiblePlayer & { firstName: string; lastName: string }

/**
 * A club's competitions, and the group each one is reserved to (#604).
 *
 * It replaced a licensee-by-licensee list of exclusions and additions (#482):
 * one choice per competition now, made from the club's own groups (#602). And
 * since the group is the list, the table here files people into it directly —
 * a competition reserved to a group of one, with twenty licensees already
 * fielded, is two clicks from being right, not twenty ticks in another dialog.
 *
 * The rule is the competition's categories AND the group: a group can only
 * narrow. So the table lists who the categories admit — in the group or not —
 * and, greyed, whoever the club put in the group but the categories refuse.
 *
 * A section of the club's page since #604 (it used to be its own screen), for
 * everyone in the club; the controls are the admins'. The competitions the
 * club does not play are folded away.
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
    memberGroups, competitionGroups, setCompetitionGroup, setMemberGroupMembers,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  const [showOthers, setShowOthers] = useState(false)

  // Reserving a competition is choosing among the club's groups, so it is
  // theirs to do who manage those groups: the club's admins, and a general admin.
  const canManage = mayManageMemberGroups(user, clubId)
  const groups = clubMemberGroups(memberGroups, clubId)

  const { played, others } = useMemo(
    () => competitionsOfClub(clubId, competitions, teams, divisions, competitionGroups),
    [clubId, competitions, teams, divisions, competitionGroups],
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
  const engagedIn = (competitionId: string) =>
    assignmentsByPlayer(competitionId, { teams: clubTeams, divisions, competitions, gameSelections })

  const names = (ps: ClubPlayer[]) => {
    const shown = ps.slice(0, 5).map((p) => `${p.firstName} ${p.lastName}`).join(', ')
    return ps.length > 5 ? `${shown} et ${ps.length - 5} autre${ps.length - 5 > 1 ? 's' : ''}` : shown
  }

  /**
   * Nothing is ever taken off a team or a line-up — eligibility bites on what
   * can be added (#482) — so any step that leaves somebody fielded outside the
   * rule asks first, says exactly that, and names them.
   */
  const confirmLeaving = (competition: Competition, leaving: ClubPlayer[], title: string, confirmLabel: string) =>
    leaving.length === 0 || confirm({
      title,
      message: `${leaving.length === 1 ? 'Un licencié que vos équipes engagent déjà ne sera' : `${leaving.length} licenciés que vos équipes engagent déjà ne seront`} plus éligible${leaving.length > 1 ? 's' : ''} à « ${competition.displayName} » : ${names(leaving)}. Rien ne les retire d'une équipe ni d'une composition ; ils ne seront simplement plus proposés ailleurs.`,
      confirmLabel,
      tone: 'accent',
    })

  const choose = async (competition: Competition, groupId: string | null) => {
    const group = groups.find((g) => g.id === groupId)
    if (group) {
      const engaged = engagedIn(competition.id)
      const leaving = clubPlayers.filter((p) => engaged.has(p.id) && !isPlayerEligible(p, competition, group))
      if (!(await confirmLeaving(
        competition, leaving,
        `Réserver « ${competition.displayName} » au groupe « ${group.displayName} » ?`, 'Réserver',
      ))) return
    }
    setCompetitionGroup(clubId, competition.id, groupId)
  }

  const file = async (competition: Competition, group: MemberGroup, ids: string[], add: boolean) => {
    if (!add) {
      const engaged = engagedIn(competition.id)
      const leaving = clubPlayers.filter((p) => ids.includes(p.id) && engaged.has(p.id))
      if (!(await confirmLeaving(
        competition, leaving, `Retirer du groupe « ${group.displayName} » ?`, 'Retirer',
      ))) return false
    }
    const next = add
      ? [...group.memberIds, ...ids.filter((id) => !group.memberIds.includes(id))]
      : group.memberIds.filter((id) => !ids.includes(id))
    setMemberGroupMembers(clubId, group.id, next)
    return true
  }

  const card = (competition: Competition) => (
    <CompetitionCard
      key={competition.id}
      idPrefix={`${idPrefix}-${competition.id}`}
      competition={competition}
      group={competitionGroupOf(clubId, competition.id, competitionGroups, memberGroups)}
      groups={groups}
      players={clubPlayers}
      engaged={engagedIn(competition.id)}
      canManage={canManage}
      onChoose={(groupId) => choose(competition, groupId)}
      onFile={(group, ids, add) => file(competition, group, ids, add)}
    />
  )

  const isSection = variant === 'section'

  return (
    <section
      id="competitions"
      aria-labelledby={`${idPrefix}-competitions-title`}
      className={
        isSection
          ? 'scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
          : 'scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
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

      {played.length + others.length === 0 ? (
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
              Le club n'a encore aucun groupe : créez-en un dans la section Groupes ci-dessus.
            </p>
          )}
          {played.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Aucune équipe du club n'est engagée dans une compétition.</p>
          ) : (
            <ul className="mt-4 space-y-4">{played.map(card)}</ul>
          )}
          {others.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={showOthers}
                onClick={() => setShowOthers((v) => !v)}
                className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
              >
                {showOthers ? 'Masquer' : 'Afficher'} les compétitions où le club n'a pas d'équipe ({others.length})
              </button>
              {showOthers && <ul className="mt-3 space-y-4">{others.map(card)}</ul>}
            </div>
          )}
        </>
      )}
      {confirmDialog}
    </section>
  )
}

type Show = 'all' | 'in' | 'out'
const SHOW_LABELS: Record<Show, string> = { all: 'Tous', in: 'Dans le groupe', out: 'Hors du groupe' }

function CompetitionCard({
  idPrefix,
  competition,
  group,
  groups,
  players,
  engaged,
  canManage,
  onChoose,
  onFile,
}: {
  idPrefix: string
  competition: Competition
  group: MemberGroup | undefined
  groups: MemberGroup[]
  players: ClubPlayer[]
  engaged: Map<string, CompetitionAssignment>
  canManage: boolean
  onChoose: (groupId: string | null) => void
  onFile: (group: MemberGroup, ids: string[], add: boolean) => Promise<boolean>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [show, setShow] = useState<Show>('all')

  // Everyone the categories admit — the ones a group can be made of — and,
  // greyed, the group's members the categories refuse.
  const rows = useMemo(() => players
    .map((player) => {
      const byCategory = playerEligibility(player, competition)
      const inGroup = !!group?.memberIds.includes(player.id)
      return { player, byCategory, inGroup, eligible: byCategory.eligible && (!group || inGroup) }
    })
    .filter((r) => r.byCategory.eligible || r.inGroup), [players, competition, group])

  const shown = rows.filter((r) => show === 'all' || (show === 'in') === r.inGroup)
  const selectable = canManage && !!group
  const pickable = shown.filter((r) => r.byCategory.eligible)
  const allPicked = pickable.length > 0 && pickable.every((r) => selected.has(r.player.id))
  const eligibleCount = rows.filter((r) => r.eligible).length
  // Fielded already, and no longer admitted: the contradiction a club has to
  // settle itself, since nothing is ever taken off a team (#482).
  const conflicts = players.filter((p) => engaged.has(p.id) && !rows.some((r) => r.player.id === p.id && r.eligible))
  const fixable = conflicts.filter((p) => rows.some((r) => r.player.id === p.id && r.byCategory.eligible))
  const toAdd = [...selected].filter((id) => !group?.memberIds.includes(id))
  const toRemove = [...selected].filter((id) => group?.memberIds.includes(id))

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const file = async (ids: string[], add: boolean) => {
    if (group && (await onFile(group, ids, add))) setSelected(new Set())
  }
  const noneLabel = competition.categories.length === 0
    ? 'Aucun — tous les licenciés'
    : 'Aucun — tous les licenciés de ces catégories'

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{competition.displayName}</p>
          <p className="text-xs text-slate-500">Catégories : {categoriesSummary(competition.categories)}</p>
        </div>
        <div className="w-full sm:w-72">
          <label htmlFor={`${idPrefix}-group`} className="block text-sm font-medium text-slate-700">
            Réservée au groupe
          </label>
          {canManage ? (
            <select
              id={`${idPrefix}-group`}
              value={group?.id ?? ''}
              onChange={(e) => {
                setSelected(new Set())
                setShow('all')
                onChoose(e.target.value || null)
              }}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0"
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
      </div>

      {conflicts.length > 0 && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            ⚠ {conflicts.length} joueur{conflicts.length > 1 ? 's' : ''} engagé{conflicts.length > 1 ? 's' : ''} mais
            plus éligible{conflicts.length > 1 ? 's' : ''}
          </span>
          {selectable && fixable.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShow('out')
                setSelected(new Set(fixable.map((p) => p.id)))
              }}
              className={`font-medium text-amber-900 underline hover:no-underline ${TEXT_TARGET_CLASS}`}
            >
              Les sélectionner
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {eligibleCount} joueur{eligibleCount > 1 ? 's' : ''} éligible{eligibleCount > 1 ? 's' : ''}
        </p>
        {group && (
          <div role="radiogroup" aria-label="Afficher" className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
            {(['all', 'in', 'out'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={show === s}
                onClick={() => setShow(s)}
                className={`min-h-[44px] px-3 py-1 font-medium md:min-h-0 ${show === s ? 'bg-accent-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {SHOW_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectable && selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <button
            type="button"
            disabled={toAdd.length === 0}
            onClick={() => file(toAdd, true)}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            Ajouter au groupe ({toAdd.length})
          </button>
          <button
            type="button"
            disabled={toRemove.length === 0}
            onClick={() => file(toRemove, false)}
            className={`${NEUTRAL_BUTTON_CLASS} disabled:opacity-50`}
          >
            Retirer du groupe ({toRemove.length})
          </button>
        </div>
      )}

      <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-slate-100">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={allPicked}
                    disabled={pickable.length === 0}
                    onChange={() => setSelected(allPicked ? new Set() : new Set(pickable.map((r) => r.player.id)))}
                    className="h-5 w-5 rounded border-slate-300 accent-accent-600 md:h-4 md:w-4"
                  />
                </th>
              )}
              <th scope="col" className="px-3 py-2">Joueur</th>
              <th scope="col" className="hidden px-3 py-2 sm:table-cell">Catégorie</th>
              {/* Below sm: the Tous / Dans le groupe / Hors du groupe filter
                  says it already, and the room goes to « Engagé ». */}
              {group && <th scope="col" className="hidden px-3 py-2 sm:table-cell">Groupe</th>}
              <th scope="col" className="px-3 py-2">Engagé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map(({ player: p, byCategory, inGroup, eligible }) => {
              const engagement = assignmentSummary(engaged.get(p.id))
              const conflict = !!engagement && !eligible
              return (
                <tr key={p.id} className={byCategory.eligible ? '' : 'text-slate-400'}>
                  {selectable && (
                    <td className="px-3 py-1.5">
                      {byCategory.eligible && (
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner ${p.firstName} ${p.lastName}`}
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          className="h-5 w-5 rounded border-slate-300 accent-accent-600 md:h-4 md:w-4"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <Link to={`/joueurs/${p.id}`} className="hover:text-accent-600">
                      {p.firstName} {p.lastName}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-1.5 sm:table-cell">
                    {categoryDisplay(p.category) || '—'}
                    {!byCategory.eligible && ` · ${ELIGIBILITY_REASON_LABELS[byCategory.reason]}`}
                  </td>
                  {group && <td className="hidden px-3 py-1.5 sm:table-cell">{inGroup ? 'Oui' : '—'}</td>}
                  <td className={`px-3 py-1.5 text-xs ${conflict ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                    {conflict && '⚠ '}
                    {engagement ?? ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-3 py-4 text-sm text-slate-400">Personne ici.</p>
        )}
      </div>
    </li>
  )
}
