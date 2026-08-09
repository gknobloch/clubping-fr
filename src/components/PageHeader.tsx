import { useRef, type ReactNode } from 'react'
import { ClubLogo } from '@/components/ClubLogo'
import { usePageScrollOffset } from '@/lib/pageScrollOffset'

/**
 * Standard list-screen header, split by function rather than by page (#311).
 *
 * Two levels, because the header was mixing two kinds of content:
 *
 * - **Identity** — club logo, title, club name, page actions. Scrolls away.
 *   Nothing here is needed mid-scroll: the app bar and the active nav item
 *   already say where you are.
 * - **Controls** — phase switcher, journée navigation, filters. Sticky, one
 *   compact row, because these are used *while* scrolling.
 *
 * Journées used to carry its own sticky block instead, stacking identity and
 * controls together into ~530px of sticky chrome on an 812px screen. Sharing
 * this component gives every list screen the same rule and keeps the markup
 * from drifting page to page (#243, #308).
 */
export function PageHeader({
  title,
  club,
  actions,
  controls,
}: {
  title: string
  club?: { id: string; displayName: string; logoUpdatedAt?: string }
  actions?: ReactNode
  /** Sticky toolbar contents. Omit on screens with nothing to control. */
  controls?: ReactNode
}) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  usePageScrollOffset(toolbarRef)

  return (
    <>
      {/* One wrapping row rather than a forced column below sm. Actions sit
          beside the title when they fit — an icon-only button does — and drop
          underneath when they don't, which is what the text-labelled screens
          still do at 375px. Forcing the column cost 62px of vertical chrome on
          every screen to solve a problem only the wide labels have (#311).

          Actions keep their natural width and wrap between themselves;
          stretching them full-width would overflow the longest labels
          ("Importer depuis un fichier" is 205px on its own), which is the
          overflow #308 fixed. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          {club && <ClubLogo clubId={club.id} logoUpdatedAt={club.logoUpdatedAt} size={44} />}
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold text-slate-800 sm:text-2xl">{title}</h1>
            {club && <p className="truncate text-sm text-slate-500 sm:text-base">{club.displayName}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      {controls && (
        // Bleeds into `main`'s padding so the opaque band covers the full width
        // once stuck, otherwise content shows through at the edges.
        <div
          ref={toolbarRef}
          data-testid="page-toolbar"
          // A plain band, not a card: the controls are 44px touch targets, and
          // a card wrapped them in another 34px of padding and border for no
          // information. The hairline reads as a toolbar rule whether stuck or
          // not, so no scroll listener is needed to know when to show it.
          //
          // `-mt-3`/`-mb-2` claw back part of the parent's `gap-6`, which the
          // band's own `py-2` was doubling up on.
          className="sticky top-14 z-10 -mx-4 -mb-2 -mt-3 border-b border-slate-200 bg-slate-50 px-4 py-2 sm:-mx-6 sm:px-6"
        >
          {/* One row, always. Below sm the controls scroll sideways instead of
              wrapping — wrapping is what let this grow to three rows on a phone,
              and the point of the sticky level is that its height stays small
              and predictable. */}
          <div className="flex items-center gap-2 overflow-x-auto [&>*]:shrink-0">
            {controls}
          </div>
        </div>
      )}
    </>
  )
}
