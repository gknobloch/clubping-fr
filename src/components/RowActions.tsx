import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ModalShell } from '@/components/ModalShell'

export type RowAction = {
  label: string
  onClick: () => void
  /** Visual weight. `accent` is the default (edit, import, …). */
  tone?: 'accent' | 'danger' | 'success'
  disabled?: boolean
  title?: string
  /**
   * Hide this action below `md:`. For work that has no usable mobile form yet —
   * the FFTT games import is a dense comparison screen, illegible at 375px
   * (#381) — so it is offered where it works rather than badly everywhere.
   *
   * Hidden by CSS inside the menu rather than filtered out of it, because the
   * menu is now the only surface on some screens (#389 review): filtering would
   * remove the action from desktop too.
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
 * therefore keeps resolving to the single inline button, at any viewport — with
 * `menuOnly` there is no inline button at all, so go through the trigger
 * (`runRowAction` in the E2E helpers does this).
 */
export function RowActions({
  actions,
  label = 'Actions',
  align = 'right',
  menuOnly = false,
}: {
  actions: MaybeAction[]
  /** Accessible name of the "…" trigger — say which row it belongs to. */
  label?: string
  /** `left` for the Équipes cards, whose actions sit under the card body. */
  align?: 'left' | 'right'
  /**
   * Use the "…" menu at every width instead of inline text buttons from `md:`.
   * On a card, three text links stacked under the body read as a section of the
   * card and crowd it; one trigger beside the content does not (#389 review).
   */
  menuOnly?: boolean
}) {
  const items = actions.filter((a): a is RowAction => Boolean(a))
  if (items.length === 0) return null
  // Every action may be desktopOnly, leaving the menu empty below md: — show no
  // trigger there rather than one that opens onto nothing.
  const hasMobileItem = items.some((a) => !a.desktopOnly)
  const justify = align === 'left' ? 'justify-start' : 'justify-end'

  if (menuOnly) {
    return (
      <div className={`flex ${hasMobileItem ? '' : 'max-md:hidden'} ${justify}`}>
        <ActionsMenu items={items} label={label} align={align} />
      </div>
    )
  }

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
      {hasMobileItem && (
        <div className={`flex md:hidden ${justify}`}>
          <ActionsMenu items={items.filter((a) => !a.desktopOnly)} label={label} align={align} />
        </div>
      )}
    </>
  )
}

// One media query for the whole page, not one per row: a list screen renders
// dozens of RowActions, and each subscribing separately would put dozens of
// listeners on the same query.
const DESKTOP = '(min-width: 768px)'

function subscribeToDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener('change', onChange)
  // `resize` as well: some embedded browsers resize the viewport without
  // emitting the media-query change, which would strand the menu in the wrong
  // presentation until the next navigation.
  window.addEventListener('resize', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
}

/** True from `md:` up, so a resize swaps the presentation with the layout. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  )
}

/**
 * The actions themselves, in whichever container suits the pointer.
 *
 * Below `md:` a bottom sheet: nothing to position, nothing to clip, full-width
 * rows under the thumb. From `md:` up a small menu anchored to the trigger — a
 * full-width sheet for three items is a phone answer to a mouse question
 * (#389 review).
 *
 * The desktop menu is portalled and placed from the trigger's rect rather than
 * positioned with CSS, because the tables sit in an `overflow-x-auto` wrapper
 * (#305) and a non-visible overflow on one axis forces the other to clip too —
 * an absolutely-placed menu inside the cell would be cut off.
 *
 * The placement respects `align` this time. Always anchoring by `right` is what
 * put the Équipes cards' menu at x=-115, off the left of the screen (#378).
 */
function ActionsMenu({
  items,
  label,
  align,
}: {
  items: RowAction[]
  label: string
  align: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function run(action: RowAction) {
    setOpen(false)
    action.onClick()
  }

  // Arrow/Home/End navigation belongs to the menu, not to where it sits, so it
  // is shared by both presentations.
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

  const place = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const r = trigger.getBoundingClientRect()
    const { offsetWidth: w, offsetHeight: h } = menu
    const below = r.bottom + 4
    const flip = below + h + 8 > window.innerHeight && r.top - h - 4 > 0
    // Anchored on the side the trigger sits on, then clamped so neither edge
    // can leave the viewport whatever the alignment.
    const wanted = align === 'left' ? r.left : r.right - w
    setPos({
      top: flip ? r.top - h - 4 : below,
      left: Math.max(8, Math.min(wanted, window.innerWidth - w - 8)),
    })
  }, [align])

  useLayoutEffect(() => {
    if (open && isDesktop) place()
    if (!open) setPos(null)
  }, [open, isDesktop, place])

  useEffect(() => {
    if (!open || !isDesktop) return
    const onPointerDown = (e: Event) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    // Capture phase: the table scrolls in its own container, and those scroll
    // events never reach window.
    document.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [open, isDesktop, place])

  // Focus the first row once placed, so the menu behaves like the sheet, whose
  // focus ModalShell handles.
  useEffect(() => {
    if (!open || !isDesktop || !pos) return
    menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [open, isDesktop, pos])

  const rows = (
    <>
      {items.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          onClick={() => run(action)}
          disabled={action.disabled}
          title={action.title}
          className={`flex min-h-[44px] w-full items-center border-t border-slate-100 px-4 text-left text-sm font-medium hover:bg-slate-50 md:min-h-0 md:py-2 ${action.desktopOnly ? 'max-md:hidden' : ''} ${TONE[action.tone ?? 'accent']} ${DISABLED}`}
        >
          {action.label}
        </button>
      ))}
    </>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:h-9 md:w-9"
      >
        <DotsIcon />
      </button>

      {open && isDesktop &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? undefined : 'hidden' }}
            className="fixed z-40 min-w-[12rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {rows}
          </div>,
          document.body,
        )}

      {open && !isDesktop && (
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
            {rows}
          </div>
        </ModalShell>
      )}
    </>
  )
}
