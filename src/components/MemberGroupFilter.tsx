import { TEXT_TARGET_CLASS } from '@/components/Button'
import { GROUP_MATCH_LABELS, type GroupMatch } from '@/lib/memberGroups'
import type { MemberGroup } from '@/types'

/**
 * Narrow a list of members to one or more of the club's groups (#602).
 *
 * Chips rather than a multi-select: a club has a handful of groups, and a row
 * of named toggles says at a glance what the list is currently showing — a
 * closed dropdown does not. They wrap on a phone.
 *
 * How several chosen groups combine only means something once there are
 * several, so the choice appears at the second chip and not before.
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
      <span className="text-sm text-slate-500">Groupes</span>
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
      {chosen.length >= 2 && (
        <div
          role="radiogroup"
          aria-label="Membres de"
          className="inline-flex overflow-hidden rounded-lg border border-accent-600 text-sm"
        >
          {(['any', 'all'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onChange(chosen, m)}
              className={`min-h-[44px] md:min-h-0 px-3 py-1 font-medium ${
                mode === m ? 'bg-accent-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {GROUP_MATCH_LABELS[m]}
            </button>
          ))}
        </div>
      )}
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
