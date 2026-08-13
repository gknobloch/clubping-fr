import { useEffect, useRef } from 'react'

// Below sm:, every dialog is a bottom sheet: anchored to the bottom edge, full
// width, square-cornered where it meets the edge, and capped so a long form
// scrolls inside itself instead of running off-screen. From sm: up it is the
// centred dialog the desktop has always had (#382).
//
// The geometry is imposed on the caller's card with a child variant rather than
// by editing fifteen call sites — and, more to the point, so the sixteenth
// inherits it too. Only `max-w-*` is left alone: modals differ there (md, lg,
// 2xl, 3xl) and that is a desktop decision.
//
// Anchoring to the bottom is not cosmetic. A centred dialog puts its actions in
// the middle of the screen, the hardest place for a thumb to reach; the sheet
// puts them where the hand already is. GameQuickView has done this since #306
// and is the most comfortable dialog in the app — this makes it the rule.
const PRESENTATION = {
  sheet:
    'items-end justify-center p-0 sm:items-center sm:p-4' +
    ' [&>*]:w-full [&>*]:max-h-[85vh] [&>*]:overflow-y-auto' +
    // Square where the sheet meets the bottom edge — mobile only, so desktop
    // keeps whatever radius the card itself declares (they differ: xl, 2xl).
    ' max-sm:[&>*]:rounded-b-none sm:[&>*]:max-h-[90vh]' +
    // Several cards carry `my-8`, from when the backdrop was the scroll
    // container and they needed room above and below. On a sheet that margin
    // just lifts it off the bottom edge. Scoped to `max-sm:` so the desktop
    // spacing is exactly what it was.
    ' max-sm:[&>*]:my-0',
  /** Centred at every width — for the avatar lightbox, which is not a form. */
  center: 'items-center justify-center p-4 [&>*]:max-h-[90vh]',
} as const

// Tailwind needs literal class names, so the stacking levels are a map rather
// than a template.
const Z = { 30: 'z-30', 40: 'z-40', 50: 'z-50' } as const

const BACKDROP = {
  default: 'bg-slate-900/50',
  /** Opaque enough to view a photograph against. */
  dark: 'bg-black/85',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Shared dialog behaviour for every modal (GameQuickView, admin edit modals,
// the avatar lightbox): Escape closes, Tab is trapped inside the dialog, and
// focus returns to the trigger on close. Renders the backdrop itself — callers
// pass the card as children and choose a presentation, not a layout.
export function ModalShell({
  onClose,
  children,
  className,
  labelledBy,
  label,
  closeOnBackdrop = false,
  presentation = 'sheet',
  z = 30,
  backdrop = 'default',
}: {
  onClose: () => void
  children: React.ReactNode
  /** Extra backdrop classes. The layout and tint are ModalShell's own. */
  className?: string
  labelledBy?: string
  label?: string
  /** Close when the backdrop itself is clicked (not the card). */
  closeOnBackdrop?: boolean
  /** `sheet` (default) is bottom-anchored below sm:; `center` never is. */
  presentation?: keyof typeof PRESENTATION
  /** Stacking level. 30 unless this opens on top of another dialog. */
  z?: keyof typeof Z
  backdrop?: keyof typeof BACKDROP
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the mount effect (callers pass
  // inline arrows; re-running would steal focus from form fields on each render).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () =>
      dialog ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)] : []
    ;(focusables()[0] ?? dialog)?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
      tabIndex={-1}
      className={`fixed inset-0 flex ${Z[z]} ${BACKDROP[backdrop]} ${PRESENTATION[presentation]} ${className ?? ''}`}
      onClick={closeOnBackdrop ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      {children}
    </div>
  )
}
