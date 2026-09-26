import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

/**
 * Picking people, the one way this app does it (#382, #602).
 *
 * The captain's line-up sheet set the pattern — a title that counts, a search
 * that appears on a long list, round marks that fill red, and « Annuler /
 * Enregistrer » side by side at the foot, where the thumb already is. Filing
 * members into a club's groups is the same gesture, so it wears the same
 * pieces rather than a lookalike: two copies of a pattern drift apart one
 * release at a time.
 *
 * Choices are held by the caller and applied on « Enregistrer », so a
 * half-made selection is never written and « Annuler » really cancels.
 */
export function SelectionPanel({
  titleId,
  title,
  header,
  search,
  children,
  onCancel,
  onSave,
  saveDisabled,
  footer,
}: {
  titleId: string
  title: React.ReactNode
  /** Under the title: a warning, a name field — whatever the pick needs. */
  header?: React.ReactNode
  /** Omitted below the threshold: a short list is read, not searched. */
  search?: { id: string; label: string; value: string; onChange: (value: string) => void }
  children: React.ReactNode
  onCancel: () => void
  onSave: () => void
  saveDisabled?: boolean
  /** Under the buttons — « Composition complète. » */
  footer?: React.ReactNode
}) {
  return (
    <ModalShell onClose={onCancel} closeOnBackdrop labelledBy={titleId} z={40}>
      {/* A column capped by ModalShell's max height: title and search stay at
          the top, « Annuler / Enregistrer » at the foot, and only the list
          between them scrolls — the app's sheet, where the buttons never go
          below the fold of a sixty-name club. */}
      <div className="flex flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="shrink-0 border-b border-slate-100 px-4 pt-4 pb-3">
          <h2 id={titleId} className="font-display text-base font-bold text-slate-800">
            {title}
          </h2>
          {header}
        </div>

        {search && (
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <label htmlFor={search.id} className="sr-only">
              {search.label}
            </label>
            <input
              id={search.id}
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.label}
              autoComplete="off"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onCancel} className={`flex-1 ${NEUTRAL_BUTTON_CLASS}`}>
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className={`flex-1 ${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            Enregistrer
          </button>
        </div>
        {footer}
      </div>
    </ModalShell>
  )
}

/** A section heading inside the list — « Cette équipe », « Autres joueurs ». */
export function SelectionSectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <p className={`px-4 ${first ? 'pt-3' : 'pt-4'} pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500`}>
      {children}
    </p>
  )
}

/**
 * One pickable row: a round mark that fills red, the name bolding with it, and
 * whatever the caller puts after it (an availability, a hint).
 */
export function SelectionRow({
  picked,
  disabled,
  dimmed,
  onToggle,
  label,
  badge,
  trailing,
}: {
  picked: boolean
  disabled?: boolean
  /** Greyed name without disabling — a player locked into another team. */
  dimmed?: boolean
  onToggle: () => void
  label: string
  /** Right after the name, inside the same line — the licence badge. */
  badge?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        aria-pressed={picked}
        className="flex min-h-11 w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-white"
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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`min-w-0 truncate text-sm ${
              dimmed ? 'text-slate-400' : picked ? 'font-semibold text-slate-900' : 'text-slate-800'
            }`}
          >
            {label}
          </span>
          {badge}
        </span>
        {trailing}
      </button>
    </li>
  )
}
