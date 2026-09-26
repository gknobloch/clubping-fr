import { useMemo, useState } from 'react'
import { SelectionPanel, SelectionRow } from '@/components/SelectionPanel'
import { PLAYER_SEARCH_LABEL, PLAYER_SEARCH_THRESHOLD, matchesSearch } from '@/lib/playerSearch'

export interface ChecklistOption {
  id: string
  label: string
  /** A second, quieter line: « Non licencié », « Archivé ». */
  hint?: string
}

/**
 * Tick a subset of a list, then save it as a whole (#602).
 *
 * The captain's line-up sheet, as a general tool: `SelectionPanel` and
 * `SelectionRow` are the same pieces `SelectionSheet` is built from, so filing
 * members into a group looks and moves exactly like composing a team. It
 * serves both directions of a club's groups — the members of one group, and
 * the groups of one member.
 *
 * `onSave` may refuse by returning `false` (a group name the club already
 * uses): the dialog then stays open, with whatever the header says about it.
 */
export function ChecklistDialog({
  idPrefix,
  title,
  header,
  options,
  selected,
  emptyLabel,
  searchLabel = PLAYER_SEARCH_LABEL,
  saveDisabled,
  saveLabel,
  onSave,
  onClose,
}: {
  idPrefix: string
  title: string
  header?: React.ReactNode
  options: ChecklistOption[]
  selected: readonly string[]
  emptyLabel: string
  searchLabel?: string
  saveDisabled?: boolean
  saveLabel?: string
  onSave: (ids: string[]) => void | boolean | Promise<boolean>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const searchable = options.length > PLAYER_SEARCH_THRESHOLD

  const shown = useMemo(
    () => (searchable ? options.filter((o) => matchesSearch(o.label, query)) : options),
    [options, query, searchable],
  )

  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    // Kept in the options' order, so the saved list reads the way the dialog
    // did. What was selected but never offered is kept too: the save replaces
    // the whole set, and a box nobody saw is not a box somebody unticked.
    const offered = new Set(options.map((o) => o.id))
    const ids = [
      ...options.map((o) => o.id).filter((id) => draft.has(id)),
      ...selected.filter((id) => !offered.has(id)),
    ]
    setBusy(true)
    const result = await onSave(ids)
    setBusy(false)
    if (result !== false) onClose()
  }

  return (
    <SelectionPanel
      titleId={`${idPrefix}-title`}
      title={`${title} (${draft.size})`}
      header={header}
      search={searchable
        ? { id: `${idPrefix}-search`, label: searchLabel, value: query, onChange: setQuery }
        : undefined}
      onCancel={onClose}
      onSave={save}
      saveDisabled={saveDisabled || busy}
      saveLabel={saveLabel}
    >
      {options.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">{emptyLabel}</p>}
      <ul>
        {shown.map((o) => (
          <SelectionRow
            key={o.id}
            picked={draft.has(o.id)}
            onToggle={() => toggle(o.id)}
            label={o.label}
            trailing={o.hint && <span className="shrink-0 text-xs text-slate-500">{o.hint}</span>}
          />
        ))}
      </ul>
      {searchable && query.trim() !== '' && shown.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          Aucun résultat pour « {query.trim()} ».
        </p>
      )}
    </SelectionPanel>
  )
}
