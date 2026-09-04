import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Competition, CompetitionEligibility, Player } from '@/types'
import { sortByName } from '@/lib/sortByName'
import {
  PLAYER_SEARCH_LABEL,
  PLAYER_SEARCH_THRESHOLD,
  filterPlayersBySearch,
} from '@/lib/playerSearch'
import { categoryDisplay, normalizeCategory, orderedCategories } from '@/lib/playerCategories'
import {
  ELIGIBILITY_ACTION_LABELS,
  ELIGIBILITY_REASON_LABELS,
  eligibilityCell,
  type EligibilityAction,
} from '@/lib/competitionEligibility'
import { assignmentSummary, type CompetitionAssignment } from '@/lib/competitionAssignments'
import { useConfirm } from '@/components/useConfirm'

/** Fixed widths so a long club and a long championship name stay readable. */
const COL = { select: 40, joueur: 220, competition: 132 } as const

/** The category filter's "everyone" and "nobody knows" entries. */
const ALL = ''
const NONE = 'none'

/**
 * How each state reads in a cell. A tick alone is the default mapping doing its
 * job; the two amended states are marked so a club can see at a glance what it
 * has actually changed, which is the whole question this screen answers.
 */
const CELL: Record<string, { glyph: string; className: string; title: string }> = {
  category: { glyph: '✓', className: 'text-emerald-600', title: ELIGIBILITY_REASON_LABELS.category },
  club_added: { glyph: '✓+', className: 'font-semibold text-accent-700', title: ELIGIBILITY_REASON_LABELS.club_added },
  club_excluded: { glyph: '✕', className: 'font-semibold text-red-600', title: ELIGIBILITY_REASON_LABELS.club_excluded },
  category_mismatch: { glyph: '–', className: 'text-slate-300', title: ELIGIBILITY_REASON_LABELS.category_mismatch },
  no_category: { glyph: '?', className: 'text-amber-600', title: ELIGIBILITY_REASON_LABELS.no_category },
}

/** Assignments per competition, per player — see src/lib/competitionAssignments. */
export type AssignmentIndex = Map<string, Map<string, CompetitionAssignment>>

/**
 * Who may play what, as one grid (#482).
 *
 * Modelled on the journées matrix: a desktop table where the whole club and
 * every competition are on screen at once, because the question a club admin
 * has is comparative — "who is missing from the youth championship?" — and a
 * list of one competition at a time cannot answer it.
 *
 * Desktop only, deliberately. Below `md:` the caller shows the per-competition
 * list instead: a grid of forty rows by five columns on a phone is a grid
 * nobody reads, and the same rule already sends /journees to cards there.
 */
export function CompetitionMatrix({
  players,
  competitions,
  overrides,
  assignments,
  canManage,
  onSet,
}: {
  players: Player[]
  competitions: Competition[]
  /** This club's amendments only — never another's. */
  overrides: CompetitionEligibility[]
  /** Who is already engaged, so an exclusion cannot be made silently. */
  assignments: AssignmentIndex
  canManage: boolean
  onSet: (competitionId: string, playerId: string, effect: 'included' | 'excluded' | 'default') => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCompetitionId, setBulkCompetitionId] = useState(competitions[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const selectAllRef = useRef<HTMLInputElement>(null)

  const sorted = useMemo(() => sortByName(players), [players])
  const searchable = sorted.length > PLAYER_SEARCH_THRESHOLD

  /** Only the categories the club actually holds — a filter of empty buckets. */
  const categoryOptions = useMemo(() => {
    const held = new Set(sorted.map((p) => normalizeCategory(p.category)).filter(Boolean))
    const options = orderedCategories().filter((c) => held.has(c.code))
    return { options, hasUnknown: sorted.some((p) => !normalizeCategory(p.category)) }
  }, [sorted])

  const shown = useMemo(() => {
    const byCategory = category === ALL
      ? sorted
      : sorted.filter((p) => {
        const code = normalizeCategory(p.category)
        return category === NONE ? !code : code === category
      })
    return searchable ? filterPlayersBySearch(byCategory, query) : byCategory
  }, [sorted, searchable, query, category])

  // A selection only ever means what is on screen: narrowing the filter must
  // not leave rows selected that nobody can see any more, or a bulk action
  // reaches players the club is no longer looking at.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(shown.map((p) => p.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [shown])

  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.id))
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && !allShownSelected
    }
  }, [selected, allShownSelected])

  const cellOf = (player: Player, competition: Competition) => {
    const verdict = eligibilityCell(player, competition, overrides)
    const summary = assignmentSummary(assignments.get(competition.id)?.get(player.id))
    // An ineligible player who is nonetheless in a squad is the contradiction
    // this screen must not hide — see src/lib/competitionAssignments.
    return { ...verdict, summary, conflict: !verdict.eligible && summary !== null }
  }

  const act = async (action: EligibilityAction, competition: Competition, player: Player) => {
    if (action === 'none' || !canManage) return
    if (action === 'exclude') {
      const summary = assignmentSummary(assignments.get(competition.id)?.get(player.id))
      if (summary && !(await confirm({
        title: `Exclure ${player.firstName} ${player.lastName} de « ${competition.displayName} » ?`,
        message: `${summary}. L'exclusion ne le retire d'aucune équipe ni d'aucune composition — elle l'empêche seulement d'être ajouté ailleurs. À vous de régler le reste.`,
        confirmLabel: 'Exclure',
      }))) return
    }
    setBusy(true)
    setNotice(null)
    await onSet(
      competition.id,
      player.id,
      action === 'exclude' ? 'excluded' : action === 'include' ? 'included' : 'default',
    )
    setBusy(false)
  }

  const bulkCompetition = competitions.find((c) => c.id === bulkCompetitionId) ?? competitions[0]

  /** The selected players a given bulk action would actually change. */
  const targetsFor = (action: EligibilityAction) => {
    if (!bulkCompetition) return []
    return shown.filter((p) => selected.has(p.id) && cellOf(p, bulkCompetition).action === action)
  }

  const runBulk = async (action: 'exclude' | 'include' | 'reset') => {
    if (!bulkCompetition || !canManage) return
    const targets = targetsFor(action)
    const untouched = selected.size - targets.length
    if (targets.length === 0) {
      setNotice(`Aucun des ${selected.size} licenciés sélectionnés n'est concerné par cette action.`)
      return
    }
    const engaged = action === 'exclude'
      ? targets.filter((p) => assignments.get(bulkCompetition.id)?.get(p.id))
      : []
    const verb = action === 'exclude' ? 'Exclure' : action === 'include' ? 'Ajouter' : 'Rétablir le défaut pour'
    if (!(await confirm({
      title: `${verb} ${targets.length} licencié${targets.length > 1 ? 's' : ''} — « ${bulkCompetition.displayName} » ?`,
      message: [
        untouched > 0 && `${untouched} licencié${untouched > 1 ? 's' : ''} de la sélection ${untouched > 1 ? 'ne sont' : "n'est"} pas concerné${untouched > 1 ? 's' : ''} et ${untouched > 1 ? 'restent' : 'reste'} inchangé${untouched > 1 ? 's' : ''}.`,
        engaged.length > 0 && `${engaged.length} ${engaged.length > 1 ? 'sont déjà engagés' : 'est déjà engagé'} dans cette compétition : l'exclusion ne les retire d'aucune équipe ni d'aucune composition.`,
      ].filter(Boolean).join(' ') || undefined,
      confirmLabel: action === 'exclude' ? 'Exclure' : 'Appliquer',
      tone: action === 'exclude' ? 'danger' : 'accent',
    }))) return

    setBusy(true)
    setNotice(null)
    const effect = action === 'exclude' ? 'excluded' : action === 'include' ? 'included' : 'default'
    // Sequential on purpose: DataContext persists each write on its own, and a
    // burst of parallel PUTs against one club buys nothing a club admin notices.
    for (const player of targets) await onSet(bulkCompetition.id, player.id, effect)
    setBusy(false)
    setSelected(new Set())
    setNotice(
      `${targets.length} licencié${targets.length > 1 ? 's' : ''} modifié${targets.length > 1 ? 's' : ''}` +
      (untouched > 0 ? `, ${untouched} inchangé${untouched > 1 ? 's' : ''}.` : '.'),
    )
  }

  const minWidth = (canManage ? COL.select : 0) + COL.joueur + competitions.length * COL.competition
  const bulkCounts = canManage && selected.size > 0 && bulkCompetition
    ? { exclude: targetsFor('exclude').length, include: targetsFor('include').length, reset: targetsFor('reset').length }
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {searchable && (
          <div>
            <label htmlFor="competition-matrix-search" className="sr-only">
              {PLAYER_SEARCH_LABEL}
            </label>
            <input
              id="competition-matrix-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={PLAYER_SEARCH_LABEL}
              autoComplete="off"
              className="min-h-11 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0"
            />
          </div>
        )}
        <div>
          <label htmlFor="competition-matrix-category" className="sr-only">Catégorie</label>
          <select
            id="competition-matrix-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0"
          >
            <option value={ALL}>Toutes les catégories</option>
            {categoryOptions.options.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
            {categoryOptions.hasUnknown && <option value={NONE}>Sans catégorie</option>}
          </select>
        </div>
        {(category !== ALL || query.trim()) && (
          <p className="text-sm text-slate-500">
            {shown.length} licencié{shown.length > 1 ? 's' : ''} sur {sorted.length}
          </p>
        )}
      </div>

      {bulkCounts && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent-200 bg-accent-50/60 px-3 py-2">
          <p className="text-sm font-medium text-slate-700">
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </p>
          <label htmlFor="competition-matrix-bulk" className="sr-only">Compétition à modifier</label>
          <select
            id="competition-matrix-bulk"
            value={bulkCompetition?.id ?? ''}
            onChange={(e) => setBulkCompetitionId(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0"
          >
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || bulkCounts.include === 0}
            onClick={() => runBulk('include')}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-accent-700 hover:bg-accent-100 disabled:opacity-40 md:min-h-0 md:py-1.5"
          >
            Ajouter ({bulkCounts.include})
          </button>
          <button
            type="button"
            disabled={busy || bulkCounts.exclude === 0}
            onClick={() => runBulk('exclude')}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 md:min-h-0 md:py-1.5"
          >
            Exclure ({bulkCounts.exclude})
          </button>
          <button
            type="button"
            disabled={busy || bulkCounts.reset === 0}
            onClick={() => runBulk('reset')}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 md:min-h-0 md:py-1.5"
          >
            Rétablir le défaut ({bulkCounts.reset})
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="min-h-11 rounded-lg px-3 text-sm text-slate-500 hover:text-slate-700 md:min-h-0 md:py-1.5"
          >
            Tout désélectionner
          </button>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{notice}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth }}>
          <colgroup>
            {canManage && <col style={{ width: COL.select }} />}
            <col style={{ width: COL.joueur }} />
            {competitions.map((c) => <col key={c.id} style={{ width: COL.competition }} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {canManage && (
                <th className="px-2 py-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={allShownSelected}
                    disabled={shown.length === 0}
                    onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((p) => p.id)) : new Set())}
                    className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left font-medium text-slate-700">Joueur</th>
              {competitions.map((c) => (
                <th
                  key={c.id}
                  className="border-l border-slate-200 px-2 py-2 text-center font-medium text-slate-700"
                >
                  {c.displayName}
                  <span className="block text-xs font-normal text-slate-500">
                    {c.isCategoryLocked ? 'Réservée' : 'Ouverte'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={competitions.length + (canManage ? 2 : 1)}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {query.trim() || category !== ALL
                    ? 'Aucun joueur ne correspond à ce filtre.'
                    : 'Aucun licencié actif dans ce club.'}
                </td>
              </tr>
            )}
            {shown.map((player) => (
              <tr key={player.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                {canManage && (
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${player.firstName} ${player.lastName}`}
                      checked={selected.has(player.id)}
                      onChange={(e) => setSelected((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(player.id)
                        else next.delete(player.id)
                        return next
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                    />
                  </td>
                )}
                <td className="px-3 py-1.5 text-slate-800">
                  {/* The name is the way out of the grid: a club admin reading a
                      row usually wants the player behind it. */}
                  <Link
                    to={`/joueurs/${player.id}`}
                    className="block rounded hover:text-accent-600"
                  >
                    <span className="block font-medium">
                      {player.firstName} {player.lastName}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {categoryDisplay(player.category) || 'Catégorie inconnue'}
                    </span>
                  </Link>
                </td>
                {competitions.map((competition) => {
                  const cell = cellOf(player, competition)
                  const look = CELL[cell.reason]
                  const label = ELIGIBILITY_ACTION_LABELS[cell.action]
                  const name = `${player.firstName} ${player.lastName} — ${competition.displayName}`
                  const actionable = canManage && cell.action !== 'none'
                  return (
                    <td key={competition.id} className="border-l border-slate-100 px-2 py-1 text-center">
                      <button
                        type="button"
                        disabled={!actionable || busy}
                        onClick={() => act(cell.action, competition, player)}
                        // The accessible name carries who and what, because a
                        // glyph in a grid tells a screen reader nothing.
                        aria-label={`${name} : ${look.title}${cell.conflict ? ` — ${cell.summary}` : ''}${actionable ? ` — ${label}` : ''}`}
                        title={`${look.title}${cell.conflict ? ` — ${cell.summary}` : ''}${actionable ? ` — ${label}` : ''}`}
                        className={`min-h-11 w-full rounded md:min-h-8 ${look.className} ${
                          actionable ? 'hover:bg-slate-100 disabled:opacity-50' : 'cursor-default'
                        }`}
                      >
                        {look.glyph}
                        {cell.conflict && <span aria-hidden className="ml-0.5 text-amber-500">⚠</span>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <li><span className="text-emerald-600">✓</span> {ELIGIBILITY_REASON_LABELS.category}</li>
        <li><span className="font-semibold text-accent-700">✓+</span> {ELIGIBILITY_REASON_LABELS.club_added}</li>
        <li><span className="font-semibold text-red-600">✕</span> {ELIGIBILITY_REASON_LABELS.club_excluded}</li>
        <li><span className="text-slate-300">–</span> {ELIGIBILITY_REASON_LABELS.category_mismatch}</li>
        <li><span className="text-amber-600">?</span> {ELIGIBILITY_REASON_LABELS.no_category}</li>
        <li><span className="text-amber-500">⚠</span> Non éligible mais déjà engagé</li>
      </ul>

      {confirmDialog}
    </div>
  )
}
