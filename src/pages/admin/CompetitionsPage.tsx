import { useMemo, useState } from 'react'
import type { Competition } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { PageHeader } from '@/components/PageHeader'
import { HeaderAction, NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'
import { PlusIcon } from '@/components/icons'
import { useConfirm } from '@/components/useConfirm'
import { categoriesSummary, orderedCategories, type PlayerCategory } from '@/lib/playerCategories'

const INPUT_CLASS =
  'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

const emptyForm = {
  displayName: '',
  categories: [] as PlayerCategory[],
  isCategoryLocked: false,
}

/**
 * The global mapping, configured once (#482).
 *
 * A general admin says which competitions exist and which categories each one
 * admits by default. Clubs amend that from their own screen; nothing here is
 * per-club, which is the whole point of calling it a default.
 */
export function CompetitionsPage() {
  const {
    competitions, divisions, addCompetition, updateCompetition, deleteCompetition,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()

  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Competition | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const archivedCount = competitions.filter((c) => c.isArchived).length
  const shown = useMemo(
    () => competitions
      .filter((c) => showArchived || !c.isArchived)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName)),
    [competitions, showArchived],
  )

  // How many divisions each competition holds — the number that says whether
  // deleting one is a tidy-up or a decision.
  const divisionCount = (competitionId: string) =>
    divisions.filter((d) => d.competitionId === competitionId && !d.isArchived).length

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setForm(emptyForm)
  }

  const openEdit = (competition: Competition) => {
    setCreating(false)
    setEditing(competition)
    setForm({
      displayName: competition.displayName,
      categories: competition.categories,
      isCategoryLocked: competition.isCategoryLocked,
    })
  }

  const closeModal = () => {
    setEditing(null)
    setCreating(false)
  }

  const toggleCategory = (code: PlayerCategory) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(code)
        ? f.categories.filter((c) => c !== code)
        : [...f.categories, code],
    }))

  const handleSave = () => {
    const displayName = form.displayName.trim()
    if (!displayName) return
    // Keep the canonical order whatever order the boxes were ticked in.
    const categories = orderedCategories()
      .map((c) => c.code)
      .filter((c) => form.categories.includes(c))
    if (editing) {
      updateCompetition(editing.id, {
        displayName, categories, isCategoryLocked: form.isCategoryLocked,
      })
    } else {
      addCompetition({
        displayName, categories, isCategoryLocked: form.isCategoryLocked,
        sortOrder: Math.max(0, ...competitions.map((c) => c.sortOrder)) + 1,
        isArchived: false,
      })
    }
    closeModal()
  }

  const handleDelete = async (competition: Competition) => {
    const attached = divisionCount(competition.id)
    if (await confirm({
      title: `Supprimer la compétition « ${competition.displayName} » ?`,
      message: attached > 0
        ? `${attached} division${attached > 1 ? 's' : ''} y ${attached > 1 ? 'sont rattachées' : 'est rattachée'} : elle${attached > 1 ? 's' : ''} ne ${attached > 1 ? 'seront' : 'sera'} plus rattachée${attached > 1 ? 's' : ''} à aucune compétition, et n'y perdra rien d'autre. Les dérogations des clubs sont supprimées.`
        : "Les dérogations des clubs sont supprimées. Cette action est irréversible.",
      confirmLabel: 'Supprimer',
    })) {
      deleteCompetition(competition.id)
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Compétitions"
        actions={
          <HeaderAction icon={<PlusIcon />} label="Ajouter une compétition" onClick={openCreate} />
        }
      />

      <p className="text-sm text-slate-600">
        Une compétition regroupe des divisions et dit quelles catégories de joueurs
        y sont admises par défaut. Chaque club peut ensuite ajouter ou retirer
        des licenciés — sauf sur une compétition verrouillée, où il ne peut que retirer.
      </p>

      {archivedCount > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les compétitions archivées ({archivedCount})
          </span>
        </label>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Compétition
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Catégories admises
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Divisions
              </th>
              <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {shown.map((competition) => (
              <tr key={competition.id} className={`hover:bg-slate-50/50 ${competition.isArchived ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {competition.displayName}
                  {competition.isCategoryLocked && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      Verrouillée
                    </span>
                  )}
                  {competition.isArchived && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      Archivée
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {categoriesSummary(competition.categories)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {divisionCount(competition.id)}
                </td>
                <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                  <RowActions
                    label={`Actions — ${competition.displayName}`}
                    actions={[
                      !competition.isArchived && { label: 'Modifier', onClick: () => openEdit(competition) },
                      !competition.isArchived && {
                        label: 'Archiver',
                        tone: 'danger',
                        onClick: () => updateCompetition(competition.id, { isArchived: true }),
                      },
                      competition.isArchived && {
                        label: 'Réactiver',
                        onClick: () => updateCompetition(competition.id, { isArchived: false }),
                      },
                      competition.isArchived && {
                        label: 'Supprimer',
                        tone: 'danger',
                        onClick: () => handleDelete(competition),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                  Aucune compétition. Tant qu'il n'y en a pas, aucune division n'est
                  restreinte et tous les licenciés restent proposés partout.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <ModalShell onClose={closeModal} labelledBy="edit-competition-title">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 id="edit-competition-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter une compétition' : 'Modifier la compétition'}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="competition-name" className="block text-sm font-medium text-slate-700">
                  Nom
                </label>
                <input
                  id="competition-name"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Championnat jeunes"
                  className={INPUT_CLASS}
                />
              </div>

              <fieldset>
                <legend className="text-sm font-medium text-slate-700">
                  Catégories admises par défaut
                </legend>
                <p className="mt-1 text-xs text-slate-500">
                  Aucune case cochée = toutes les catégories.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                  {orderedCategories().map(({ code, label }) => (
                    <label key={code} className="flex min-h-[36px] items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.categories.includes(code)}
                        onChange={() => toggleCategory(code)}
                        className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
                      />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={form.isCategoryLocked}
                  onChange={(e) => setForm((f) => ({ ...f, isCategoryLocked: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
                />
                <span className="text-sm text-slate-700">
                  Réservée à ces catégories
                  <span className="block text-xs text-slate-500">
                    Un club pourra retirer un licencié, jamais en ajouter un hors catégorie.
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModal} className={NEUTRAL_BUTTON_CLASS}>
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={form.displayName.trim() === ''}
                className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-40`}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
