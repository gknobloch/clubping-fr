import type { Competition } from '@/types'
import { ModalShell } from '@/components/ModalShell'
import { categoryLabel, orderedCategoryPicks } from '@/lib/playerCategories'

/**
 * Spelled out, not the compact codes the admin table uses: this dialog is the
 * one place a club admin comes to *learn* the rule, and "B, M, C, J" is a
 * reminder for someone who already knows it.
 */
function admitted(categories: Competition['categories']): string {
  if (categories.length === 0) return 'Toutes les catégories'
  return orderedCategoryPicks(categories).map(categoryLabel).join(', ')
}

/**
 * What a competition admits, and what this club may do about it (#482).
 *
 * The grid states a verdict per cell but never the rule behind it, and the rule
 * is the part a club admin has to hold in their head: which categories the
 * default admits, whether the championship can be widened at all, and what the
 * club has already changed. A column header cannot carry that, so it goes
 * behind an ⓘ — read on demand, not read every time.
 */
export function CompetitionInfo({
  competition,
  counts,
  onClose,
}: {
  competition: Competition
  counts: { eligible: number; total: number; added: number; excluded: number; conflicts: number }
  onClose: () => void
}) {
  return (
    <ModalShell onClose={onClose} closeOnBackdrop label={competition.displayName} z={40}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{competition.displayName}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {competition.isCategoryLocked ? 'Compétition réservée' : 'Compétition ouverte'}
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Catégories admises par défaut</dt>
            <dd className="text-slate-600">{admitted(competition.categories)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Ce que le club peut faire</dt>
            <dd className="text-slate-600">
              {competition.isCategoryLocked
                ? "Retirer un licencié que la compétition admet. Elle est réservée à ses catégories : aucun autre licencié ne peut y être ajouté, même par dérogation."
                : "Retirer un licencié que la compétition admet, ou ajouter un licencié qu'elle écarte."}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Dans ce club</dt>
            <dd className="text-slate-600">
              {counts.eligible} licencié{counts.eligible > 1 ? 's' : ''} éligible
              {counts.eligible > 1 ? 's' : ''} sur {counts.total}
              {(counts.added > 0 || counts.excluded > 0) && (
                <>
                  {' '}— dont {counts.added} ajouté{counts.added > 1 ? 's' : ''} et {counts.excluded}{' '}
                  exclu{counts.excluded > 1 ? 's' : ''} par le club
                </>
              )}
              .
            </dd>
          </div>
          {counts.conflicts > 0 && (
            <div className="rounded-lg bg-amber-50 p-3">
              <dt className="font-medium text-amber-800">⚠ À régler</dt>
              <dd className="text-amber-700">
                {counts.conflicts} licencié{counts.conflicts > 1 ? 's' : ''} non éligible
                {counts.conflicts > 1 ? 's' : ''} {counts.conflicts > 1 ? 'sont' : 'est'} pourtant
                engagé{counts.conflicts > 1 ? 's' : ''} dans une équipe ou une composition de cette
                compétition. L'éligibilité ne retire personne d'une équipe : c'est au club de
                trancher.
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Les catégories par défaut sont fixées une fois pour toutes par l'administrateur général.
          Les dérogations ci-contre ne valent que pour ce club, et ne s'appliquent qu'à ce qui peut
          encore être ajouté — jamais aux disponibilités déjà données ni aux compositions déjà
          faites.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200 md:min-h-0 md:py-2"
          >
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
