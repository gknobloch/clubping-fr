import { useMemo, useState } from 'react'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

export interface ChecklistOption {
  id: string
  label: string
  /** A second, quieter line: « Non licencié », « Archivé ». */
  hint?: string
}

/**
 * Tick a subset of a list, then save it as a whole (#602).
 *
 * Both directions of a club's groups go through it: the members of one group,
 * from the club's page, and the groups of one member, from their fiche. A
 * draft rather than a write per tick: the API replaces the set in one request,
 * and « Annuler » has to mean that nothing moved.
 *
 * The search box appears past a dozen options — a club's forty members, not
 * its three groups.
 */
export function ChecklistDialog({
  idPrefix,
  title,
  subtitle,
  options,
  selected,
  emptyLabel,
  onSave,
  onClose,
}: {
  idPrefix: string
  title: string
  subtitle?: string
  options: ChecklistOption[]
  selected: readonly string[]
  emptyLabel: string
  onSave: (ids: string[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected))
  const [query, setQuery] = useState('')
  const searchable = options.length > 12

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr')
    return q ? options.filter((o) => o.label.toLocaleLowerCase('fr').includes(q)) : options
  }, [options, query])

  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <ModalShell onClose={onClose} labelledBy={`${idPrefix}-title`}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white p-6 shadow-lg">
        <h2 id={`${idPrefix}-title`} className="font-display text-lg font-semibold text-slate-800">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}

        {searchable && (
          <input
            type="search"
            aria-label="Rechercher"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-4 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          />
        )}

        <ul className="mt-3 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {options.length === 0 && <li className="py-3 text-sm text-slate-500">{emptyLabel}</li>}
          {shown.map((o) => {
            const picked = draft.has(o.id)
            return (
              <li key={o.id}>
                {/* The captain's roster row (SelectionSheet): a round mark
                    that fills red, the name bolding with it. One way to pick
                    people in this app, whatever is being picked for. */}
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => toggle(o.id)}
                  className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-slate-50"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                      picked
                        ? 'border-accent-600 bg-accent-600 text-white'
                        : 'border-slate-300 text-transparent'
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${picked ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                      {o.label}
                    </span>
                    {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-sm tabular-nums text-slate-500">
            {draft.size} sélectionné{draft.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                // Kept in the options' order, so the saved list reads the way
                // the dialog did. What was selected but never offered is kept
                // too: the save replaces the whole set, and a box nobody saw is
                // not a box somebody unticked.
                const offered = new Set(options.map((o) => o.id))
                onSave([
                  ...options.map((o) => o.id).filter((id) => draft.has(id)),
                  ...selected.filter((id) => !offered.has(id)),
                ])
                onClose()
              }}
              className={PRIMARY_BUTTON_CLASS}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
