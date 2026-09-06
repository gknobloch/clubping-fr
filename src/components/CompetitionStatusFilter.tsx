import { useEffect, useRef, useState } from 'react'
import { CELL_STATUSES, CELL_STATUS_LABELS, type CellStatus } from '@/lib/competitionEligibility'

/**
 * The per-competition status filter: a button that opens a list of checkboxes.
 *
 * Positioned `fixed` off the trigger's own rectangle rather than absolutely
 * inside the header. The grid scrolls sideways, and an `overflow-x-auto`
 * container clips both axes — an absolutely positioned panel would be cut off
 * at the first row.
 */
export function CompetitionStatusFilter({
  competitionName,
  selected,
  onChange,
}: {
  competitionName: string
  selected: Set<CellStatus>
  onChange: (next: Set<CellStatus>) => void
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setAt({ top: rect.bottom + 4, left: rect.left })
    setOpen((o) => !o)
  }

  const flip = (status: CellStatus) => {
    const next = new Set(selected)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    onChange(next)
  }

  const label = selected.size === 0 ? 'Tous les statuts' : `${selected.size} statut${selected.size > 1 ? 's' : ''}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Filtrer ${competitionName} par statut`}
        className={`mt-1 w-full truncate rounded border px-2 py-1 text-xs font-normal ${
          selected.size > 0
            ? 'border-accent-300 bg-accent-50 text-accent-700'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
        }`}
      >
        {label} ▾
      </button>

      {open && at && (
        <div
          ref={panelRef}
          role="group"
          aria-label={`Statuts — ${competitionName}`}
          style={{ top: at.top, left: at.left }}
          className="fixed z-40 w-64 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-lg"
        >
          {CELL_STATUSES.map((status) => (
            <label
              key={status}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(status)}
                onChange={() => flip(status)}
                className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
              />
              {CELL_STATUS_LABELS[status]}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs font-normal text-slate-500 hover:bg-slate-50"
            >
              Effacer le filtre
            </button>
          )}
        </div>
      )}
    </>
  )
}
