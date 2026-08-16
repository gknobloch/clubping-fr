import type { PlayerImportRow, PlayerSyncField } from '@/lib/ffttPlayers'
import { fieldKey, writableFields } from '@/lib/ffttPlayers'

/**
 * How to call this licensee on the row's own line: the name we already hold,
 * falling back to FFTT's for someone we do not know yet. Printing FFTT's name
 * on a player we hold would read as "this is their name now", when the diff
 * below is the only thing that says what changes — and FFTT exports names
 * unaccented, so its spelling is usually the worse of the two.
 */
function rowName(row: PlayerImportRow): string {
  const held = (key: PlayerSyncField['key']) => row.fields.find((f) => f.key === key)?.current
  return `${held('firstName') ?? row.licence.firstName} ${held('lastName') ?? row.licence.lastName}`
}

const STATUS_BADGE: Record<PlayerImportRow['status'], { label: string; className: string }> = {
  new: { label: 'Nouveau', className: 'bg-green-100 text-green-800' },
  changed: { label: 'Modifié', className: 'bg-amber-100 text-amber-800' },
  unchanged: { label: 'Identique', className: 'bg-slate-100 text-slate-600' },
}

/**
 * Player-by-player, field-by-field review of an FFTT import (#384) — the same
 * before/after idea as ClubImportPreview (#280), one level deeper because this
 * import can carry a whole club at once.
 *
 * Only the fields that would actually be written are listed under a player:
 * an eighty-licence club import that reprinted four unchanged fields each time
 * would bury the handful of lines that matter.
 */
export function PlayerImportPreview({
  rows, selected, onToggleField, onToggleRow,
}: {
  rows: PlayerImportRow[]
  /** Selected `licence:field` keys. */
  selected: Set<string>
  onToggleField: (licence: string, field: PlayerSyncField['key']) => void
  onToggleRow: (licence: string, checked: boolean) => void
}) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {rows.map((row) => {
        const fields = writableFields(row.fields)
        const badge = STATUS_BADGE[row.status]
        const rowChecked = fields.length > 0 && fields.every((f) => selected.has(fieldKey(row.licence.licence, f.key)))
        const rowId = `import-player-${row.licence.licence}`
        return (
          <li key={row.licence.licence} className="px-3 py-2.5">
            <div className="flex items-start gap-3">
              <input
                id={rowId}
                type="checkbox"
                checked={rowChecked}
                disabled={fields.length === 0}
                onChange={(e) => onToggleRow(row.licence.licence, e.target.checked)}
                className="mt-1 rounded border-slate-300 text-accent-600 focus:ring-accent-500 disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={rowId} className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${fields.length ? 'text-slate-800' : 'text-slate-500'}`}>
                    {rowName(row)}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{row.licence.licence}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </label>

                {fields.length === 0 ? (
                  <p className="mt-0.5 text-sm text-slate-500">Rien à écrire — déjà à jour.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {fields.map((f) => {
                      const id = `${rowId}-${f.key}`
                      return (
                        <li key={f.key} className="flex items-start gap-2">
                          <input
                            id={id}
                            type="checkbox"
                            checked={selected.has(fieldKey(row.licence.licence, f.key))}
                            onChange={() => onToggleField(row.licence.licence, f.key)}
                            className="mt-1 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                          />
                          <label htmlFor={id} className="text-sm text-slate-700">
                            <span className="text-xs uppercase tracking-wide text-slate-400">{f.label}</span>{' '}
                            {f.current !== null && (
                              <>
                                <span className="line-through decoration-slate-300 text-slate-500">{f.current}</span>
                                <span className="text-slate-400"> → </span>
                              </>
                            )}
                            <span className="font-medium text-slate-800">{f.incoming}</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
