import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import type { AvailabilityStatus } from '@/types'

// Availability and line-up controls, lifted out of MatchDaysPage so the mobile
// match detail can reuse the exact same widgets as the desktop matrix — labels,
// colours and option order can't drift between the two views (#306).

/** Custom team dropdown with colored dots. Options ordered: player's team (if any), empty, then other teams. */
export function TeamSelect({
  value,
  onChange,
  optionIds,
  getLabel,
  getColor,
  disabled,
  className = '',
}: {
  value: string | null
  onChange: (teamId: string | null) => void
  optionIds: (string | null)[]
  getLabel: (teamId: string) => string
  getColor: (teamId: string) => string | undefined
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [listRect, setListRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Use 'click' not 'mousedown': the list is in a portal (document.body), so ref only
    // contains the button. On mousedown the option would be "outside" and we'd close
    // before the option's click fired, so onChange would never run.
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setListRect(null)
      return
    }
    const listHeight = 160
    const updateRect = () => {
      if (buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - r.bottom
        const top = spaceBelow < listHeight ? r.top - listHeight - 2 : r.bottom + 2
        setListRect({ top, left: r.left, width: Math.max(r.width, 140) })
      }
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  const displayLabel = value ? getLabel(value) : '—'
  const displayColor = value ? getColor(value) : undefined

  const dropdownList = open && listRect && (
    <ul
      className="fixed max-h-48 overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg text-xs z-[100]"
      role="listbox"
      style={{
        top: listRect.top,
        left: listRect.left,
        width: listRect.width,
      }}
    >
      {optionIds.map((id) => {
        const label = id === null ? '—' : getLabel(id)
        const color = id === null ? undefined : getColor(id)
        const isSelected = value === id
        return (
          <li
            key={id ?? '__empty__'}
            role="option"
            aria-selected={isSelected}
            onClick={() => {
              onChange(id)
              setOpen(false)
            }}
            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
          >
            {color ? (
              <span
                className="shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
            ) : (
              <span className="shrink-0 w-2.5 h-2.5" aria-hidden />
            )}
            <span className="truncate">{label}</span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-left text-xs flex items-center gap-1.5 min-h-[26px] hover:border-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {displayColor && (
          <span
            className="shrink-0 w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: displayColor }}
            aria-hidden
          />
        )}
        <span className="truncate">{displayLabel}</span>
        <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdownList && createPortal(dropdownList, document.body)}
    </div>
  )
}

export const AVAILABILITY_OPTIONS: (AvailabilityStatus | null)[] = [null, 'available', 'maybe', 'unavailable']
export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: 'Oui',
  maybe: 'Peut-être',
  unavailable: 'Non',
}
export const AVAILABILITY_COLORS: Record<AvailabilityStatus, string> = {
  available: '#22c55e',
  maybe: '#eab308',
  unavailable: '#ef4444',
}

/** Read-only team composition label with optional colored dot. */
export function ReadOnlyCompo({ teamId, getLabel, getColor }: {
  teamId: string | null
  getLabel: (id: string) => string
  getColor: (id: string) => string | undefined
}) {
  const color = teamId ? getColor(teamId) : undefined
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      {color && (
        <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      )}
      {teamId ? getLabel(teamId) : '—'}
    </span>
  )
}

/** Custom availability dropdown with colored dots. */
export function AvailabilitySelect({
  value,
  onChange,
  className = '',
}: {
  value: AvailabilityStatus | undefined
  onChange: (status: AvailabilityStatus | null) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [listRect, setListRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setListRect(null)
      return
    }
    const listHeight = 130
    const updateRect = () => {
      if (buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - r.bottom
        const top = spaceBelow < listHeight ? r.top - listHeight - 2 : r.bottom + 2
        setListRect({ top, left: r.left, width: Math.max(r.width, 100) })
      }
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  const displayLabel = value ? AVAILABILITY_LABELS[value] : '—'
  const displayColor = value ? AVAILABILITY_COLORS[value] : undefined

  const dropdownList = open && listRect && (
    <ul
      className="fixed max-h-48 overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg text-xs z-[100]"
      role="listbox"
      style={{ top: listRect.top, left: listRect.left, width: listRect.width }}
    >
      {AVAILABILITY_OPTIONS.map((s) => {
        const label = s === null ? '—' : AVAILABILITY_LABELS[s]
        const color = s === null ? undefined : AVAILABILITY_COLORS[s]
        const isSelected = (value ?? null) === s
        return (
          <li
            key={s ?? '__empty__'}
            role="option"
            aria-selected={isSelected}
            onClick={() => {
              onChange(s)
              setOpen(false)
            }}
            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
          >
            {color ? (
              <span
                className="shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
            ) : (
              <span className="shrink-0 w-2.5 h-2.5" aria-hidden />
            )}
            <span className="truncate">{label}</span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-left text-xs flex items-center gap-1.5 min-h-[26px] hover:border-slate-400"
      >
        {displayColor && (
          <span
            className="shrink-0 w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: displayColor }}
            aria-hidden
          />
        )}
        <span className="truncate">{displayLabel}</span>
        <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdownList && createPortal(dropdownList, document.body)}
    </div>
  )
}
