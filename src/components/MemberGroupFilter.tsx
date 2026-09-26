import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Toggle } from '@/components/Toggle'
import { GROUP_MATCH_LABELS, type GroupMatch } from '@/lib/memberGroups'
import type { MemberGroup } from '@/types'

/**
 * Narrow a list of members to one or more of the club's groups (#602).
 *
 * Chips rather than a multi-select: a club has a handful of groups, and a row
 * of named toggles says at a glance what the list is currently showing — a
 * closed dropdown does not. They wrap on a phone.
 *
 * How several chosen groups combine is `GroupMatchToggle`, which sits with the
 * list's other switch rather than among the chips.
 */
export function MemberGroupFilter({
  groups,
  selected,
  mode,
  onChange,
}: {
  groups: MemberGroup[]
  selected: readonly string[]
  mode: GroupMatch
  onChange: (selected: string[], mode: GroupMatch) => void
}) {
  if (groups.length === 0) return null
  const chosen = groups.filter((g) => selected.includes(g.id)).map((g) => g.id)

  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id], mode)

  return (
    <div role="group" aria-label="Filtrer par groupe" className="flex flex-wrap items-center gap-2">
      {groups.map((g) => {
        const on = chosen.includes(g.id)
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(g.id)}
            className={`min-h-[44px] md:min-h-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              on
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {g.displayName}
          </button>
        )
      })}
      {chosen.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([], mode)}
          className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
        >
          Effacer
        </button>
      )}
    </div>
  )
}

/**
 * OU or ET, as a switch like « Joueurs actifs uniquement » beside it (#602):
 * off is « Au moins un groupe », on is « Tous les groupes », and the label
 * says which one is in force. Only once two groups are chosen — before that the
 * two answers are the same, and a switch that changes nothing is noise.
 */
export function GroupMatchToggle({
  groups,
  selected,
  mode,
  onChange,
}: {
  groups: MemberGroup[]
  selected: readonly string[]
  mode: GroupMatch
  onChange: (selected: string[], mode: GroupMatch) => void
}) {
  const chosen = groups.filter((g) => selected.includes(g.id)).map((g) => g.id)
  if (chosen.length < 2) return null
  return (
    <Toggle
      checked={mode === 'all'}
      onChange={(all) => onChange(chosen, all ? 'all' : 'any')}
      label={GROUP_MATCH_LABELS[mode]}
    />
  )
}
