import type { ReactNode } from 'react'

/**
 * Shared "identity" header for entity/profile screens (Compte, MyClub,
 * PlayerDetail, TeamDetail) — the same rounded box as PageHeader, but with a
 * flexible leading slot (avatar / club logo / colored badge) and free-form
 * content under the title instead of a fixed subtitle, since these vary more
 * than a list screen's plain title + actions (#243 follow-up).
 *
 * Its scale follows PageHeader's exactly. It used to be a size larger at every
 * width, so Accueil and Club wore a noticeably heavier header than Équipes,
 * Joueurs and Journées — on a phone that cost a chunk of the first screen, and
 * a long name wrapped onto two lines (#389 review).
 */
export function IdentityCard({
  leading,
  title,
  trailing,
  children,
}: {
  leading?: ReactNode
  title: ReactNode
  trailing?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-semibold text-slate-800 sm:text-2xl">{title}</h1>
        {children}
      </div>
      {trailing}
    </div>
  )
}
