import type { ButtonHTMLAttributes } from 'react'

// A fixed height keeps both variants pixel-identical: without it, the
// secondary variant's 1px border adds 2px to its auto height compared to the
// primary variant, which is exactly what made header actions across pages
// render a couple of pixels off from one another (#243 follow-up).
// h-11 (44px) below md: is the Apple HIG / Material touch target; desktop keeps
// the original h-9 so the chrome doesn't grow where a mouse is doing the aiming
// (#307).
const base = 'inline-flex h-11 md:h-9 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50'

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
