import { useMemo, useState } from 'react'
import type { LifecycleStatus, Phase } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { FFTT_PHASES, phaseOrderKey } from '@/lib/ffttPhases'
import { STATUS_BADGES, STATUS_LABELS } from '@/lib/status'
import { StatusRadioGroup } from '@/components/StatusRadioGroup'
import { ModalShell } from '@/components/ModalShell'
import { PageHeader } from '@/components/PageHeader'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, PrimaryButton } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'
import { useConfirm } from '@/components/useConfirm'

export function PhasesPage() {
  const { phases: allPhases, seasons, updatePhase, addPhase, archivePhase, deletePhase } = useAppData()
  const [editing, setEditing] = useState<Phase | null>(null)
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState<{
    seasonId: string
    name: string
    displayName: string
    status: LifecycleStatus
  }>({
    seasonId: '',
    name: '',
    displayName: '',
    status: 'upcoming',
  })
  const [confirm, confirmDialog] = useConfirm()

  const activePhases = useMemo(() => allPhases.filter((p) => p.status !== 'archived'), [allPhases])
  const archivedPhases = useMemo(() => allPhases.filter((p) => p.status === 'archived'), [allPhases])
  const phases = showArchived ? allPhases : activePhases

  const getSeasonName = (seasonId: string) =>
    seasons.find((s) => s.id === seasonId)?.displayName ?? seasonId

  const openEdit = (phase: Phase) => {
    setEditing(phase)
    setCreating(false)
    setForm({
      seasonId: phase.seasonId,
      name: phase.name,
      displayName: phase.displayName,
      status: phase.status,
    })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    const firstSeasonId = seasons.find((s) => s.status === 'active')?.id ?? seasons[0]?.id ?? ''
    setForm({
      seasonId: firstSeasonId,
      name: 'Phase 1',
      displayName: firstSeasonId ? `${getSeasonName(firstSeasonId)} Phase 1` : '',
      status: 'upcoming',
    })
  }

  const closeModal = () => {
    setEditing(null)
    setCreating(false)
  }

  const handleSeasonChange = (seasonId: string) => {
    const seasonName = getSeasonName(seasonId)
    setForm((f) => ({
      ...f,
      seasonId,
      displayName: seasonName ? `${seasonName} ${f.name}` : f.displayName,
    }))
  }

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      displayName: f.seasonId ? `${getSeasonName(f.seasonId)} ${name}` : name,
    }))
  }

  // The (season, phase) pair must be unique — the id derives from it.
  const duplicate = creating && allPhases.some(
    (p) => p.seasonId === form.seasonId && p.name === form.name,
  )

  // What the active (season · phase) combination becomes after saving with
  // « Active » selected (#227): this phase + its season.
  const willChangeActive = form.status === 'active' && editing?.status !== 'active'
  const targetSeasonName = getSeasonName(form.seasonId)
  const currentActiveSeason = seasons.find((s) => s.status === 'active')
  const currentActivePhase = allPhases.find((p) => p.status === 'active' && p.id !== editing?.id)

  const handleSave = () => {
    if (editing) {
      updatePhase(editing.id, {
        displayName: form.displayName,
        status: form.status,
      })
      closeModal()
    } else if (creating && form.seasonId && form.displayName && !duplicate) {
      addPhase({
        seasonId: form.seasonId,
        name: form.name,
        displayName: form.displayName,
        status: form.status,
      })
      closeModal()
    }
  }

  const handleArchive = async (phase: Phase) => {
    if (await confirm({ title: `Archiver la phase "${phase.displayName}" ?`, message: `Elle ne sera plus visible dans la liste active.`, confirmLabel: 'Archiver' })) {
      archivePhase(phase.id)
    }
  }

  const handleDelete = async (phase: Phase) => {
    if (await confirm({ title: `Supprimer définitivement la phase "${phase.displayName}" ?`, message: `Les divisions, groupes, équipes, journées, matchs, disponibilités et compositions associés seront également supprimés. Cette action est irréversible.`, confirmLabel: 'Supprimer' })) {
      deletePhase(phase.id)
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Phases"
        actions={<PrimaryButton onClick={openCreate}>Ajouter une phase</PrimaryButton>}
      />
      {archivedPhases.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les phases archivées ({archivedPhases.length})
          </span>
        </label>
      )}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Phase
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Saison
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Statut
              </th>
              <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {phases.map((phase) => (
              <tr key={phase.id} className={`hover:bg-slate-50/50 ${phase.status === 'archived' ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {phase.displayName}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{getSeasonName(phase.seasonId)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[phase.status]}`}
                  >
                    {STATUS_LABELS[phase.status]}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                  <RowActions
                    label={`Actions — ${phase.displayName}`}
                    actions={[
                      // Modifier stays available on archived phases so a mistaken
                      // archive can be reverted via the status radios (#223).
                      { label: 'Modifier', onClick: () => openEdit(phase) },
                      phase.status !== 'archived' && {
                        label: 'Archiver',
                        tone: 'danger',
                        onClick: () => handleArchive(phase),
                      },
                      phase.status === 'archived' && {
                        label: 'Supprimer',
                        tone: 'danger',
                        onClick: () => handleDelete(phase),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <ModalShell
          onClose={closeModal}
          labelledBy="phase-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="phase-modal-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter une phase' : 'Modifier la phase'}
            </h2>
            <div className="mt-4 space-y-4">
              {creating && (
                <>
                  <div>
                    <label htmlFor="phase-seasonId" className="block text-sm font-medium text-slate-700">
                      Saison
                    </label>
                    <select
                      id="phase-seasonId"
                      value={form.seasonId}
                      onChange={(e) => handleSeasonChange(e.target.value)}
                      className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    >
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>{s.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="phase-name" className="block text-sm font-medium text-slate-700">
                      Phase
                    </label>
                    {/* FFTT phases only (#227) — the local id derives from it. */}
                    <select
                      id="phase-name"
                      value={form.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    >
                      {FFTT_PHASES.map((p) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    {duplicate && (
                      <p className="mt-1 text-sm text-red-600">Cette phase existe déjà pour cette saison.</p>
                    )}
                  </div>
                </>
              )}
              {!creating && (
                <div>
                  <label htmlFor="phase-displayName" className="block text-sm font-medium text-slate-700">
                    Nom affiché
                  </label>
                  <input
                    id="phase-displayName"
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
              )}
              {creating && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Nom affiché</label>
                  <p className="mt-1 text-sm text-slate-600">{form.displayName}</p>
                </div>
              )}
              <div>
                <span className="block text-sm font-medium text-slate-700">Statut</span>
                <StatusRadioGroup
                  name="phase-status"
                  value={form.status}
                  onChange={(status) => setForm((f) => ({ ...f, status }))}
                />
                {willChangeActive && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700">
                    <p>
                      Après enregistrement, la combinaison active sera :{' '}
                      <span className="font-semibold">{targetSeasonName} · {form.name}</span>.
                    </p>
                    {currentActiveSeason && currentActiveSeason.id !== form.seasonId && (
                      <p className="mt-1">
                        La saison {currentActiveSeason.displayName}{' '}
                        {Number(currentActiveSeason.id) < Number(form.seasonId)
                          ? 'sera archivée'
                          : 'repassera à « À venir »'}.
                      </p>
                    )}
                    {currentActivePhase && (
                      <p className="mt-1">
                        La phase {currentActivePhase.displayName}{' '}
                        {phaseOrderKey(currentActivePhase.seasonId, currentActivePhase.name) <
                        phaseOrderKey(form.seasonId, form.name)
                          ? 'sera archivée'
                          : 'repassera à « À venir »'}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className={NEUTRAL_BUTTON_CLASS}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={duplicate}
                className={PRIMARY_BUTTON_CLASS}
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
