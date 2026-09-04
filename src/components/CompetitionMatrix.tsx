import { useMemo, useState } from 'react'
import type { Competition, CompetitionEligibility, Player } from '@/types'
import { sortByName } from '@/lib/sortByName'
import {
  PLAYER_SEARCH_LABEL,
  PLAYER_SEARCH_THRESHOLD,
  filterPlayersBySearch,
} from '@/lib/playerSearch'
import { categoryDisplay } from '@/lib/playerCategories'
import {
  ELIGIBILITY_ACTION_LABELS,
  ELIGIBILITY_REASON_LABELS,
  eligibilityCell,
  type EligibilityAction,
} from '@/lib/competitionEligibility'

/** Fixed widths so a long club and a long championship name stay readable. */
const COL = { joueur: 220, competition: 132 } as const

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
  canManage,
  onSet,
}: {
  players: Player[]
  competitions: Competition[]
  /** This club's amendments only — never another's. */
  overrides: CompetitionEligibility[]
  canManage: boolean
  onSet: (competitionId: string, playerId: string, effect: 'included' | 'excluded' | 'default') => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const sorted = useMemo(() => sortByName(players), [players])
  const searchable = sorted.length > PLAYER_SEARCH_THRESHOLD
  const shown = searchable ? filterPlayersBySearch(sorted, query) : sorted

  const act = async (action: EligibilityAction, competitionId: string, playerId: string) => {
    if (action === 'none' || !canManage) return
    setBusy(true)
    await onSet(
      competitionId,
      playerId,
      action === 'exclude' ? 'excluded' : action === 'include' ? 'included' : 'default',
    )
    setBusy(false)
  }

  const minWidth = COL.joueur + competitions.length * COL.competition

  return (
    <div className="space-y-3">
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth }}>
          <colgroup>
            <col style={{ width: COL.joueur }} />
            {competitions.map((c) => <col key={c.id} style={{ width: COL.competition }} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
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
                  colSpan={competitions.length + 1}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {query.trim()
                    ? `Aucun joueur ne correspond à « ${query.trim()} ».`
                    : 'Aucun licencié actif dans ce club.'}
                </td>
              </tr>
            )}
            {shown.map((player) => (
              <tr key={player.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-1.5 text-slate-800">
                  <span className="block font-medium">
                    {player.firstName} {player.lastName}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {categoryDisplay(player.category) || 'Catégorie inconnue'}
                  </span>
                </td>
                {competitions.map((competition) => {
                  const cell = eligibilityCell(player, competition, overrides)
                  const look = CELL[cell.reason]
                  const label = ELIGIBILITY_ACTION_LABELS[cell.action]
                  const name = `${player.firstName} ${player.lastName} — ${competition.displayName}`
                  return (
                    <td key={competition.id} className="border-l border-slate-100 px-2 py-1 text-center">
                      <button
                        type="button"
                        disabled={!canManage || cell.action === 'none' || busy}
                        onClick={() => act(cell.action, competition.id, player.id)}
                        // The accessible name carries who and what, because a
                        // glyph in a grid tells a screen reader nothing.
                        aria-label={`${name} : ${look.title}${canManage && cell.action !== 'none' ? ` — ${label}` : ''}`}
                        title={canManage && cell.action !== 'none' ? `${look.title} — ${label}` : look.title}
                        className={`min-h-11 w-full rounded md:min-h-8 ${look.className} ${
                          canManage && cell.action !== 'none'
                            ? 'hover:bg-slate-100 disabled:opacity-50'
                            : 'cursor-default'
                        }`}
                      >
                        {look.glyph}
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
      </ul>
    </div>
  )
}
