import type { ReactNode } from 'react'
import { ClubLogo } from '@/components/ClubLogo'

/**
 * Standard admin list-screen header: rounded box, title (+ optional club
 * logo/name when the screen is club-scoped), and a right-aligned actions
 * slot. Shared by Clubs, Saisons, Phases, Divisions, Groupes, Équipes and
 * Joueurs so the header markup can't drift apart page to page (#243).
 * Journées keeps its own header — its sticky multi-control toolbar (phase
 * switcher, team shortcuts, journée switcher) is a different shape entirely.
 */
export function PageHeader({
  title,
  club,
  actions,
}: {
  title: string
  club?: { id: string; displayName: string; logoUpdatedAt?: string }
  actions?: ReactNode
}) {
  return (
    // Below sm: the actions drop under the title. The row already wrapped, but
    // `shrink-0` sized it to max-content, so it never got narrow enough for the
    // wrap to trigger and the whole page overflowed instead (#308). Actions
    // keep their natural width and wrap between themselves — stretching them
    // full-width would overflow the longest labels ("Importer depuis un
    // fichier" is 205px on its own).
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {club && <ClubLogo clubId={club.id} logoUpdatedAt={club.logoUpdatedAt} size={56} />}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-slate-800">{title}</h1>
          {club && <p className="text-slate-500">{club.displayName}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
