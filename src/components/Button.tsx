import type { ButtonHTMLAttributes } from 'react'

// A fixed height keeps both variants pixel-identical: without it, the
// secondary variant's 1px border adds 2px to its auto height compared to the
// primary variant, which is exactly what made header actions across pages
// render a couple of pixels off from one another (#243 follow-up).
// h-11 (44px) below md: is the Apple HIG / Material touch target; desktop keeps
// the original h-9 so the chrome doesn't grow where a mouse is doing the aiming
// (#307).
const base = 'inline-flex h-11 md:h-9 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50'

// The same two looks, as class strings rather than components, for the ~40 form
// and modal footers that build their own <button>. They predate Button.tsx and
// each carried its own copy of the classes minus a height, which is why every
// modal footer still measured 36px after #307 — `base` was never theirs to
// inherit. Importing the string is a one-line change per site; converting the
// call sites to <PrimaryButton> wholesale is a bigger refactor than #372 needs.
export const PRIMARY_BUTTON_CLASS = `${base} bg-accent-600 text-white hover:bg-accent-700`

/** Neutral/cancel look — "Annuler", "Fermer". Not the bordered SecondaryButton. */
export const NEUTRAL_BUTTON_CLASS = `${base} bg-slate-100 text-slate-700 hover:bg-slate-200`

/** Shape and height only — for one-off looks (a green "Réactiver", say). */
export const BASE_BUTTON_CLASS = base

/** Bordered accent look, for a secondary action rendered as a bare <button>. */
export const OUTLINE_BUTTON_CLASS = `${base} border`

/** Destructive actions — "Archiver ce club", "Supprimer définitivement". */
export const DANGER_BUTTON_CLASS = `${base} bg-red-600 text-white hover:bg-red-700`

// Icon-only controls and bare text links: pad the hit area out to 44px without
// touching the glyph or the type. The icon stays 16px — only what the finger
// has to find grows, and only below md: (#372).
export const ICON_TARGET_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0'

/** Same idea for inline text actions, which need the height but not the width. */
export const TEXT_TARGET_CLASS = 'inline-flex min-h-11 items-center md:min-h-0'

export function PrimaryButton({
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`${base} bg-accent-600 text-white hover:bg-accent-700 ${className}`}
      {...props}
    />
  )
}

export function SecondaryButton({
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`${base} border border-accent-600 text-accent-600 hover:bg-accent-50 ${className}`}
      {...props}
    />
  )
}

/**
 * Page-header action: an icon-only square below `md:`, icon + label above.
 *
 * The labels these carry are long — "Importer depuis la FFTT" is 205px — and
 * two or three of them side by side pushed the header into a second and third
 * row on a phone, eating the top of every list screen (#389 review).
 *
 * `aria-label` carries the full label at every width, so the accessible name
 * never changes with the viewport and a test can find the button by its words
 * whatever the screen size.
 */
export function HeaderAction({
  icon,
  label,
  onClick,
  variant = 'primary',
  disabled,
  desktopOnly,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  /**
   * `adaptive` is filled below `md:` and outlined above — for the "add" button
   * on a screen whose import is `desktopOnly`: on a phone it is the only action
   * left, so the page would otherwise have no filled one; on desktop the import
   * takes that role (#384).
   */
  variant?: 'primary' | 'secondary' | 'adaptive'
  disabled?: boolean
  /** Hidden below `md:`, for work with no usable mobile form yet (#381). */
  desktopOnly?: boolean
}) {
  const look =
    variant === 'primary'
      ? 'bg-accent-600 text-white hover:bg-accent-700'
      : variant === 'secondary'
        ? 'border border-accent-600 text-accent-600 hover:bg-accent-50'
        : 'bg-accent-600 text-white hover:bg-accent-700' +
          ' md:border md:border-accent-600 md:bg-white md:text-accent-600 md:hover:bg-accent-50'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${base} gap-2 max-md:w-11 max-md:px-0 ${desktopOnly ? 'max-md:hidden' : ''} ${look}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}
