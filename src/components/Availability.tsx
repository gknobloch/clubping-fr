import type { AvailabilityStatus } from '@/types'

// One geometry for the whole OUI / PE / NON family, editable or not.
//
// 44px below md: — this is the one control every licensee touches, and it used
// to measure 36-49px wide by 26px tall, the smallest target in the app sitting
// on its most-used path (#372). Original chip size from md: up, the same trade
// the shared buttons make in Button.tsx (#307).
const cellClass = (size: 'sm' | 'md') =>
  `inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border font-semibold md:min-h-0 md:min-w-0 ${
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
  }`

// OUI / PE / NON toggle for a player's own availability. Clicking a status sets
// it; clicking the active one clears it. Read-only `disabled` keeps the chips
// but ignores clicks (e.g. past games).
export function AvailabilityButtons({
  status,
  onSet,
  onClear,
  disabled,
  size = 'md',
}: {
  status?: AvailabilityStatus
  onSet: (s: AvailabilityStatus) => void
  onClear: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const cell = (s: AvailabilityStatus, label: string, active: string) => {
    const on = status === s
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => (on ? onClear() : onSet(s))}
        className={`${cellClass(size)} ${
          on ? active : 'border-slate-200 text-slate-400'
        } ${disabled ? 'cursor-default opacity-60' : 'hover:border-slate-300'}`}
      >
        {label}
      </button>
    )
  }
  return (
    <span className="flex shrink-0 gap-1">
      {cell('available', 'OUI', 'border-green-500 bg-green-50 text-green-700')}
      {cell('maybe', 'PE', 'border-amber-500 bg-amber-50 text-amber-700')}
      {cell('unavailable', 'NON', 'border-accent-500 bg-accent-50 text-accent-600')}
    </span>
  )
}

// Read-only OUI / PE / NON triplet with the player's status highlighted (e.g.
// another player's row in the game modal).
//
// Shares `cellClass` with AvailabilityButtons so the two render at identical
// size. They used to differ — 26px read-only against 44px editable (#372) —
// which put the same triplet at two sizes in one list and read as a hierarchy
// rather than as an editable/read-only distinction (#376). Size now says
// nothing; only the muted palette does.
export function AvailabilityPills({
  status,
  size = 'md',
}: {
  status?: AvailabilityStatus
  /** Must match the AvailabilityButtons size used in the same list. */
  size?: 'sm' | 'md'
}) {
  const pill = (active: boolean, on: string, label: string) => (
    <span className={`${cellClass(size)} ${active ? on : 'border-slate-200 text-slate-300'}`}>
      {label}
    </span>
  )
  return (
    <span className="flex shrink-0 gap-1">
      {pill(status === 'available', 'border-green-500 bg-green-50 text-green-700', 'OUI')}
      {pill(status === 'maybe', 'border-amber-500 bg-amber-50 text-amber-700', 'PE')}
      {pill(status === 'unavailable', 'border-accent-500 bg-accent-50 text-accent-600', 'NON')}
    </span>
  )
}

// Compact single-badge summary of a status, e.g. the Accueil upcoming-match
// card for a non-editable viewer. Falls back to "À confirmer" when unset.
export function AvailabilityChip({ status }: { status?: AvailabilityStatus }) {
  const map = {
    available: { label: 'Disponible', cls: 'border-green-500 bg-green-50 text-green-700' },
    maybe: { label: 'Peut-être', cls: 'border-amber-500 bg-amber-50 text-amber-700' },
    unavailable: { label: 'Indisponible', cls: 'border-accent-500 bg-accent-50 text-accent-600' },
  } as const
  const v = status ? map[status] : { label: 'À confirmer', cls: 'border-slate-200 bg-slate-50 text-slate-500' }
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${v.cls}`}>{v.label}</span>
}

// The "selected for the line-up" mark that goes in front of a name, wherever a
// roster is listed with its answers — the quick view, and the Accueil card that
// replaces it from md: up (#461). Reserves its own width when off, so the names
// under it line up whether anyone is selected or not.
export function LineupCheck({ on }: { on?: boolean }) {
  if (!on) return <span className="h-4 w-4 shrink-0" aria-hidden="true" />
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white" aria-label="Sélectionné">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}
