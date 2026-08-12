import { useRef, useState } from 'react'
import { ModalShell } from '@/components/ModalShell'

export type RowAction = {
  label: string
  onClick: () => void
  /** Visual weight. `accent` is the default (edit, import, …). */
  tone?: 'accent' | 'danger' | 'success'
  disabled?: boolean
  title?: string
  /**
   * Keep this action out of the below-`md:` menu. For work that has no usable
   * mobile form yet — the FFTT games import is a dense comparison screen that
   * is illegible at 375px (#381) — so it is offered where it works rather than
   * offered badly everywhere.
   */
  desktopOnly?: boolean
}

/**
 * Falsy entries are dropped, so call sites keep their `cond && { … }` shape.
 * `''` is in there because guards are often on optional strings (`team.groupId
 * && …`), which narrow to the empty string rather than to `false`.
 */
type MaybeAction = RowAction | false | '' | null | undefined

const TONE = {
  accent: 'text-accent-600 hover:text-accent-800',
  danger: 'text-red-600 hover:text-red-800',
  success: 'text-green-700 hover:text-green-900',
} as const

const DISABLED =
  'disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:text-slate-300'

// The Actions column pins itself to the right edge of the scrollport below md:,
// so the "…" trigger is there without scrolling sideways first. `overflow-x-auto`
// alone leaves the actions reachable but not visible, and on a 4-column table at
// 375px that means every row action starts with a horizontal swipe. Desktop goes
// back to a plain cell — the table fits, and nothing needs to float.
const STICKY = 'sticky right-0 z-10 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)] md:static md:shadow-none'
// The opaque fill is what stops the row showing through as it scrolls under
// the pinned cell, and it is dropped again at md: — a static cell that paints
// its own white would sit as a pale seam across every hovered row.
/** For the `<th>`, which sits on the `bg-slate-50` header row. */
export const ACTIONS_HEADER = `${STICKY} bg-slate-50 md:bg-transparent`
/** For the `<td>`, over the `bg-white` body. */
export const ACTIONS_CELL = `${STICKY} bg-white md:bg-transparent`

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

/**
 * Row actions for the admin list screens (#307, #305).
 *
 * Two renderings of the same `actions` array, picked by viewport:
 *
 * - from `md:` up, the inline text buttons the tables have always had;
 * - below `md:`, a single 44px "…" trigger opening a menu of 44px rows.
 *
 * Inline was 54x20px targets spaced 12px apart in a dense table — small
 * targets with close neighbours, which is what made mis-taps so easy. Rolling
 * them into one menu also shrinks the Actions column enough that the table
 * stops being the widest thing on the page, which is half of #305.
 *
 * Note for tests: the menu rows are `role="menuitem"`, not `role="button"`, and
 * only exist while the menu is open. A `getByRole('button', { name: 'Modifier' })`
 * therefore keeps resolving to the single inline button, at any viewport.
 */
export function RowActions({
  actions,
  label = 'Actions',
  align = 'right',
}: {
  actions: MaybeAction[]
  /** Accessible name of the "…" trigger — say which row it belongs to. */
  label?: string
  /** `left` for the Équipes cards, whose actions sit under the card body. */
  align?: 'left' | 'right'
}) {
  const items = actions.filter((a): a is RowAction => Boolean(a))
  if (items.length === 0) return null
  // Every action on the row may be desktopOnly, leaving nothing for the "…"
  // trigger to open — render no trigger rather than an empty menu.
  const menuItems = items.filter((a) => !a.desktopOnly)
  const justify = align === 'left' ? 'justify-start' : 'justify-end'

  return (
    <>
      <div className={`hidden gap-3 md:flex md:items-center ${justify}`}>
        {items.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
            className={`text-sm font-medium ${TONE[action.tone ?? 'accent']} ${DISABLED}`}
          >
            {action.label}
          </button>
        ))}
      </div>
      {menuItems.length > 0 && (
        <div className={`flex md:hidden ${justify}`}>
          <ActionsMenu items={menuItems} label={label} />
        </div>
      )}
    </>
  )
}

function ActionsMenu({ items, label }: { items: RowAction[]; label: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // A bottom sheet rather than a menu positioned against the trigger (#382).
  //
  // What this deletes is the point. The old menu measured the trigger, chose a
  // side, flipped when it would fall off the bottom, re-measured on every
  // scroll and resize, and rendered invisible for one pass so it could read its
  // own height. All of that to place a box near a 44px dot — and it still got
  // it wrong: it always anchored by `right`, so on the Équipes cards, whose
  // trigger sits at the left edge, the menu was laid out from about x=-140 and
  // was unreachable (#378).
  //
  // A sheet has nothing to compute. It cannot be off-screen, it cannot be
  // clipped by the table's `overflow-x-auto` wrapper, and its rows are the full
  // width of the screen instead of a 12rem column.
  function run(action: RowAction) {
    setOpen(false)
    action.onClick()
  }

  // Arrow/Home/End navigation is a property of the menu, not of where it sits,
  // so it survives the move to a sheet. ModalShell already lands focus on the
  // first row and traps Tab inside.
  const menuRef = useRef<HTMLDivElement>(null)
  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const focusable = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []),
    ]
    if (focusable.length === 0) return
    const at = focusable.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? focusable.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % focusable.length
      : (at - 1 + focusable.length) % focusable.length
    focusable[next].focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <DotsIcon />
      </button>
      {open && (
        <ModalShell onClose={() => setOpen(false)} closeOnBackdrop label={label} z={40}>
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="rounded-t-2xl bg-white pb-2 shadow-xl sm:rounded-2xl"
          >
            <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            {items.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => run(action)}
                disabled={action.disabled}
                title={action.title}
                className={`flex min-h-[44px] w-full items-center border-t border-slate-100 px-4 text-left text-sm font-medium hover:bg-slate-50 ${TONE[action.tone ?? 'accent']} ${DISABLED}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </ModalShell>
      )}
    </>
  )
}
