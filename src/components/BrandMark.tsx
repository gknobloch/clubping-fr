import { useId } from 'react'

// Club Ping brand mark — "face à face": two bats leaning towards each other with
// the ball between them, one red rubber and one black per the ITTF rule. Mirrors
// public/logo.svg; the dark blade and its handle use currentColor so the mark
// picks up the text colour it sits next to.
//
// Below 24px the handles close up on the blades — use public/favicon.svg there
// instead, which is the same drawing with the handles dropped.
export function BrandMark({ className = '', title }: { className?: string; title?: string }) {
  // Scoped so two marks on the same page can't share a clipPath id. useId()
  // wraps its output in colons (":r0:"), and Safari refuses to resolve those
  // inside url(#...) — strip them.
  const clipId = `mark-${useId().replace(/:/g, '')}`

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="24" cy="25" r="14" />
        </clipPath>
      </defs>
      <g transform="translate(0 .7)">
        <g strokeWidth="6.5" strokeLinecap="round">
          <line x1="20" y1="31.9" x2="10.5" y2="48.4" stroke="currentColor" />
          <line x1="44" y1="31.9" x2="53.5" y2="48.4" stroke="#e23b3b" />
        </g>
        <circle cx="24" cy="25" r="14" fill="currentColor" />
        <circle cx="40" cy="25" r="14" fill="#e23b3b" />
        <circle cx="40" cy="25" r="14" fill="#8e2a2a" clipPath={`url(#${clipId})`} />
        <circle cx="32" cy="25" r="5" fill="#ffffff" />
      </g>
    </svg>
  )
}
