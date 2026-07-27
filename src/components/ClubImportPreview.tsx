import type { ClubSyncField } from '@/lib/ffttClub'

/**
 * Field-by-field review of an FFTT club import (#280): current value, incoming
 * value, and a checkbox per line. Shared by the club creation flow
 * (ImportClubModal, where there is no current value) and the sync on an
 * existing club (ClubDetailPage, where the before/after is the whole point —
 * a hand-edited club name should not be silently replaced by FFTT's).
 */
export function ClubImportPreview({
  fields, selected, onToggle, lockedKeys = [],
}: {
  fields: ClubSyncField[]
  selected: Set<ClubSyncField['key']>
  onToggle: (key: ClubSyncField['key']) => void
  /** Keys shown as ticked and non-interactive (a new club must have a name). */
  lockedKeys?: Array<ClubSyncField['key']>
}) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {fields.map((f) => {
        const locked = lockedKeys.includes(f.key)
        const selectable = !f.unchanged && !f.unavailable && !locked
        const checked = locked || selected.has(f.key)
        const inputId = `import-field-${f.key}`
        return (
          <li key={f.key} className="px-3 py-2.5">
            <div className="flex items-start gap-3">
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={!selectable}
                onChange={() => onToggle(f.key)}
                className="mt-0.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500 disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={inputId}
                  className={`block text-sm font-medium ${selectable ? 'text-slate-800' : 'text-slate-500'}`}
                >
                  {f.label}
                </label>

                {f.unavailable ? (
                  <p className="mt-0.5 text-sm text-slate-500">
                    Rien à importer : la FFTT ne fournit pas cette information.
                  </p>
                ) : f.unchanged ? (
                  <p className="mt-0.5 text-sm text-slate-500">
                    Identique — <span className="text-slate-600">{f.incoming}</span>
                  </p>
                ) : (
                  <div className="mt-0.5 space-y-0.5 text-sm">
                    {f.current !== null && (
                      <p className="text-slate-500">
                        <span className="text-xs uppercase tracking-wide text-slate-400">Actuel</span>{' '}
                        <span className="line-through decoration-slate-300">{f.current}</span>
                      </p>
                    )}
                    <p className="text-slate-800">
                      <span className="text-xs uppercase tracking-wide text-slate-400">
                        {f.current === null ? 'À créer' : 'FFTT'}
                      </span>{' '}
                      <span className="font-medium">{f.incoming}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
