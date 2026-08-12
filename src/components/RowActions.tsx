import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  // `null` until measured — the menu is rendered to read its height, so it has
  // to stay invisible for that first pass or it flashes at the top-left corner.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)

  // Fixed coordinates measured off the trigger. The menu is portalled to
  // <body> because the table now sits in an `overflow-x-auto` wrapper (#305),
  // and a scroll container clips its descendants at its own edge — a menu
  // rendered in the cell would be cut off exactly like the buttons used to be.
  //
  // Being outside the table also means it no longer travels with it, so the
  // placement is redone on every scroll. Closing on scroll instead would be
  // less code but wrong in practice: reaching the trigger at the right edge of
  // a scrollable table often scrolls the container, and the menu would shut
  // itself the moment it opened.
  const place = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const rect = trigger.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false)
      return
    }
    const height = menu.offsetHeight
    const below = rect.bottom + 4
    const flip = below + height + 8 > window.innerHeight && rect.top - height - 4 > 0
    setPos({
      top: flip ? rect.top - height - 4 : below,
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
    else focusedRef.current = false
  }, [open, place])

  // Waits for the first placement: until `pos` is set the menu is still
  // `visibility: hidden`, and focus does not land on a hidden element. The ref
  // keeps it to once per opening — later placements are scrolls, and stealing
  // focus back on each one would fight whoever is arrowing through the list.
  useEffect(() => {
    if (!open || !pos || focusedRef.current) return
    focusedRef.current = true
    menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [open, pos])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: Event) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    // Escape is handled here rather than only on the menu so it works wherever
    // focus happens to be.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    // Capture phase: the table scrolls inside its own container now, and those
    // scroll events never reach window.
    document.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  function toggle() {
    setPos(null)
    setOpen((o) => !o)
  }

  function run(action: RowAction) {
    setOpen(false)
    action.onClick()
  }

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
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <DotsIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ top: pos?.top ?? 0, right: pos?.right ?? 0, visibility: pos ? undefined : 'hidden' }}
            className="fixed z-40 min-w-[12rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {items.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => run(action)}
                disabled={action.disabled}
                title={action.title}
                className={`flex min-h-[44px] w-full items-center px-4 text-left text-sm font-medium hover:bg-slate-50 ${TONE[action.tone ?? 'accent']} ${DISABLED}`}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
