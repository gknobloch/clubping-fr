import { useEffect, useMemo, useState } from 'react'
import type { Division, Organization } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { ImportDivisionsModal } from '@/components/ImportDivisionsModal'
import { PageHeader } from '@/components/PageHeader'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, PrimaryButton, SecondaryButton } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'
import { PhaseSwitchButton } from '@/components/icons'
import { canMoveDivisionDown, canMoveDivisionUp } from '@/lib/ffttDivisions'
import { ffttPhaseIdForName } from '@/lib/ffttPhases'
import { groupOrganizationsByType } from '@/lib/ffttOrganizations'
import { useConfirm } from '@/components/useConfirm'

export function DivisionsPage() {
  const {
    divisions: allDivisions,
    phases,
    updateDivision,
    addDivision,
    moveDivisionUp,
    moveDivisionDown,
    archiveDivision,
    deleteDivision,
    fetchOrganizations,
    fetchDivisionsPreview,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()

  // Phase switcher — defaults to the active phase, chronological order (#235).
  const orderedPhases = useMemo(
    () => [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [phases],
  )
  const activePhase = phases.find((p) => p.status === 'active')
  const [filterPhaseId, setFilterPhaseId] = useState<string | undefined>(undefined)
  const filterPhase = orderedPhases.find((p) => p.id === filterPhaseId) ?? activePhase ?? orderedPhases[orderedPhases.length - 1]
  const phaseIndex = orderedPhases.findIndex((p) => p.id === filterPhase?.id)

  // Organization — optional filter narrowing the division list to one FFTT
  // championship, same mechanism as /groupes (#237). Best-effort: it never
  // blocks browsing when the FFTT lookup is slow or fails, it just stops
  // narrowing.
  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [organizationId, setOrganizationId] = useState('')
  const [orgDivisionIds, setOrgDivisionIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOrganizations().then((list) => { if (!cancelled && list) setOrgs(list) })
    return () => { cancelled = true }
  }, [fetchOrganizations])

  useEffect(() => {
    const ffttPhaseId = filterPhase ? ffttPhaseIdForName(filterPhase.name) : null
    if (!organizationId || !filterPhase || !ffttPhaseId) {
      setOrgDivisionIds(null)
      return
    }
    let cancelled = false
    fetchDivisionsPreview(organizationId, filterPhase.seasonId, Number(ffttPhaseId)).then((result) => {
      if (cancelled) return
      setOrgDivisionIds(
        result && result !== 'no_contest'
          ? new Set(result.divisions.filter((d) => d.exists).map((d) => d.id))
          : new Set(),
      )
    })
    return () => { cancelled = true }
  }, [organizationId, filterPhase, fetchDivisionsPreview])

  const orgGroups = useMemo(() => groupOrganizationsByType(orgs), [orgs])

  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Division | null>(null)
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState({ phaseId: '', displayName: '', parentId: '', playersPerGame: 4 })

  const activeDivisions = useMemo(() => allDivisions.filter((d) => !d.isArchived), [allDivisions])
  const archivedDivisions = useMemo(() => allDivisions.filter((d) => d.isArchived), [allDivisions])
  const visibleDivisions = showArchived ? allDivisions : activeDivisions
  const divisions = (filterPhase
    ? visibleDivisions.filter((d) => d.phaseId === filterPhase.id)
    : visibleDivisions
  ).filter((d) => !orgDivisionIds || orgDivisionIds.has(d.id))

  const divisionsByPhase = divisions
    .slice()
    .sort((a, b) => a.rank - b.rank)

  // #236: a division with a parent is locked relative to it (see
  // canMoveDivisionUp/Down) — it can never rank above its own parent, nor can
  // the parent rank below it.
  const getCanMoveUp = (div: Division) => {
    if (div.isArchived) return false
    const inPhase = activeDivisions.filter((d) => d.phaseId === div.phaseId).sort((a, b) => a.rank - b.rank)
    return canMoveDivisionUp(div, inPhase)
  }
  const getCanMoveDown = (div: Division) => {
    if (div.isArchived) return false
    const inPhase = activeDivisions.filter((d) => d.phaseId === div.phaseId).sort((a, b) => a.rank - b.rank)
    return canMoveDivisionDown(div, inPhase)
  }

  const openEdit = (div: Division) => {
    setEditing(div)
    setCreating(false)
    setForm({
      phaseId: div.phaseId,
      displayName: div.displayName,
      parentId: div.parentId ?? '',
      playersPerGame: div.playersPerGame,
    })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    const phaseId = filterPhase?.id || phases[0]?.id || ''
    setForm({
      phaseId,
      displayName: '',
      parentId: '',
      playersPerGame: 4,
    })
  }

  const closeModal = () => {
    setEditing(null)
    setCreating(false)
  }

  const handleSave = () => {
    if (editing) {
      updateDivision(editing.id, {
        displayName: form.displayName,
        playersPerGame: form.playersPerGame,
      })
      closeModal()
    } else if (creating && form.phaseId) {
      // Rank derives from the chosen parent (#236): dropped right after it,
      // pushing every division already ranked there (or below) down by one.
      // No parent = appended at the end, as before.
      const inPhase = activeDivisions.filter((d) => d.phaseId === form.phaseId).sort((a, b) => a.rank - b.rank)
      const parent = inPhase.find((d) => d.id === form.parentId)
      const rank = parent ? parent.rank + 1 : Math.max(0, ...inPhase.map((d) => d.rank)) + 1
      for (const d of inPhase) {
        if (d.rank >= rank) updateDivision(d.id, { rank: d.rank + 1 })
      }
      addDivision({
        phaseId: form.phaseId,
        displayName: form.displayName,
        rank,
        playersPerGame: form.playersPerGame,
        isArchived: false,
        ...(parent ? { parentId: parent.id } : {}),
      })
      closeModal()
    }
  }

  const handleArchive = async (div: Division) => {
    if (await confirm({ title: `Archiver la division "${div.displayName}" ?`, message: `Elle ne sera plus visible dans la liste active.`, confirmLabel: 'Archiver' })) {
      archiveDivision(div.id)
    }
  }

  const handleDelete = async (div: Division) => {
    if (await confirm({ title: `Supprimer définitivement la division "${div.displayName}" ?`, message: `Les groupes, équipes, journées, matchs, disponibilités et compositions associés seront également supprimés. Cette action est irréversible.`, confirmLabel: 'Supprimer' })) {
      deleteDivision(div.id)
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Divisions"
        actions={
          <>
            {/* Manual add is the fallback; FFTT import is the default path (#219). */}
            <SecondaryButton onClick={openCreate}>Ajouter une division</SecondaryButton>
            <PrimaryButton onClick={() => setImportOpen(true)}>Importer depuis la FFTT</PrimaryButton>
          </>
        }
      />
      {importOpen && (
        <ImportDivisionsModal
          onClose={() => setImportOpen(false)}
          defaultOrganizationId={organizationId}
          onImported={setOrganizationId}
        />
      )}
      {/* Phase switcher (#235) */}
      {filterPhase && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <PhaseSwitchButton
            dir="prev"
            disabled={phaseIndex <= 0}
            onClick={() => phaseIndex > 0 && setFilterPhaseId(orderedPhases[phaseIndex - 1].id)}
          />
          <span className="font-display text-sm font-semibold text-slate-800">{filterPhase.displayName}</span>
          <PhaseSwitchButton
            dir="next"
            disabled={phaseIndex >= orderedPhases.length - 1}
            onClick={() => phaseIndex < orderedPhases.length - 1 && setFilterPhaseId(orderedPhases[phaseIndex + 1].id)}
          />
        </div>
      )}
      <div>
        <label htmlFor="divisions-org" className="block text-sm font-medium text-slate-700">
          Organisation <span className="font-normal text-slate-400">(filtre optionnel)</span>
        </label>
        <select
          id="divisions-org"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          className="mt-1 min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        >
          <option value="">Toutes</option>
          {orgGroups.map((g) => (
            <optgroup key={g.type} label={g.label}>
              {g.organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.identifier})</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {archivedDivisions.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les divisions archivées ({archivedDivisions.length})
          </span>
        </label>
      )}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Division
              </th>
              <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-slate-700 w-24">
                Ordre
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Joueurs / match
              </th>
              <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {divisionsByPhase.map((div) => (
              <tr key={div.id} className={`hover:bg-slate-50/50 ${div.isArchived ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {div.displayName}
                  {div.isArchived && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      Archivée
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {/* Reorder is a pair of adjacent targets, so the gap matters
                      as much as the size does below md: (#307). */}
                  <div className="flex items-center justify-center gap-2 md:gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveDivisionUp(div.id)}
                      disabled={!getCanMoveUp(div)}
                      title="Monter"
                      className="flex h-11 w-11 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none md:h-8 md:w-8"
                      aria-label="Monter"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDivisionDown(div.id)}
                      disabled={!getCanMoveDown(div)}
                      title="Descendre"
                      className="flex h-11 w-11 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none md:h-8 md:w-8"
                      aria-label="Descendre"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{div.playersPerGame}</td>
                <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                  <RowActions
                    label={`Actions — ${div.displayName}`}
                    actions={[
                      !div.isArchived && { label: 'Modifier', onClick: () => openEdit(div) },
                      !div.isArchived && {
                        label: 'Archiver',
                        tone: 'danger',
                        onClick: () => handleArchive(div),
                      },
                      div.isArchived && {
                        label: 'Supprimer',
                        tone: 'danger',
                        onClick: () => handleDelete(div),
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
          labelledBy="edit-division-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="edit-division-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter une division' : 'Modifier la division'}
            </h2>
            <div className="mt-4 space-y-4">
              {creating && (
                <div>
                  <label htmlFor="edit-phaseId" className="block text-sm font-medium text-slate-700">
                    Phase
                  </label>
                  <select
                    id="edit-phaseId"
                    value={form.phaseId}
                    onChange={(e) => setForm((f) => ({ ...f, phaseId: e.target.value, parentId: '' }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    {phases.map((p) => (
                      <option key={p.id} value={p.id}>{p.displayName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="edit-displayName" className="block text-sm font-medium text-slate-700">
                  Nom de la division
                </label>
                <input
                  id="edit-displayName"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              {creating && (
                <div>
                  <label htmlFor="edit-parentId" className="block text-sm font-medium text-slate-700">
                    Division parente
                  </label>
                  <select
                    id="edit-parentId"
                    value={form.parentId}
                    onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    <option value="">Aucune (division de tête)</option>
                    {activeDivisions
                      .filter((d) => d.phaseId === form.phaseId)
                      .sort((a, b) => a.rank - b.rank)
                      .map((d) => (
                        <option key={d.id} value={d.id}>{d.displayName}</option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="edit-playersPerGame" className="block text-sm font-medium text-slate-700">
                  Joueurs par match
                </label>
                <input
                  id="edit-playersPerGame"
                  type="number"
                  min={1}
                  value={form.playersPerGame}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, playersPerGame: Number(e.target.value) || 1 }))
                  }
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
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
