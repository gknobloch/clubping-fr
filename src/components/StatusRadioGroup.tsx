import type { LifecycleStatus } from '@/types'
import { STATUS_LABELS } from '@/lib/status'

const ORDER: LifecycleStatus[] = ['upcoming', 'active', 'archived']

/** Radio group for the seasons/phases 3-state lifecycle (#227). */
export function StatusRadioGroup({
  name,
  value,
  onChange,
}: {
  /** HTML radio group name — must be unique per form. */
  name: string
  value: LifecycleStatus
  onChange: (status: LifecycleStatus) => void
}) {
  return (
    <div className="mt-1 flex gap-4" role="radiogroup" aria-label="Statut">
      {ORDER.map((status) => (
        // The label is the tap target, so it carries the 44px, not the 13px
        // radio inside it (#372).
        <label key={status} className="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            name={name}
            value={status}
            checked={value === status}
            onChange={() => onChange(status)}
            className="h-5 w-5 border-slate-300 text-accent-600 focus:ring-accent-500 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-700">{STATUS_LABELS[status]}</span>
        </label>
      ))}
    </div>
  )
}
