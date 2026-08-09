import { useEffect, useMemo, useState } from 'react'
import type { Group, Organization } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { ImportGroupsModal } from '@/components/ImportGroupsModal'
import { ImportGamesModal } from '@/components/ImportGamesModal'
import { ImportScheduleDocumentModal } from '@/components/ImportScheduleDocumentModal'
import { PageHeader } from '@/components/PageHeader'
import { PrimaryButton, SecondaryButton } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'
import { PhaseSwitchButton } from '@/components/icons'
import { ffttPhaseIdForName } from '@/lib/ffttPhases'
import { groupOrganizationsByType } from '@/lib/ffttOrganizations'

export function GroupsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'general_admin' || user?.role === 'club_admin'
  const {
    groups: allGroups, divisions, phases, teams, clubs,
    updateGroup, addGroup, archiveGroup, deleteGroup, resetGroupGames,
    fetchOrganizations, fetchDivisionsPreview,
  } = useAppData()

  // Phase switcher — defaults to the active phase, chronological order (#237).
  const orderedPhases = useMemo(
    () => [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [phases],
  )
  const activePhase = phases.find((p) => p.status === 'active')
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const phase = phases.find((p) => p.id === phaseId) ?? activePhase ?? orderedPhases[orderedPhases.length - 1]
  const phaseIndex = orderedPhases.findIndex((p) => p.id === phase?.id)

  // Organization — optional filter narrowing the division picker to one FFTT
  // championship (#237). Best-effort: it never blocks browsing when the FFTT
  // lookup is slow or fails, it just stops narrowing.
  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [organizationId, setOrganizationId] = useState('')
  const [orgDivisionIds, setOrgDivisionIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOrganizations().then((list) => { if (!cancelled && list) setOrgs(list) })
    return () => { cancelled = true }
  }, [fetchOrganizations])

  useEffect(() => {
    const ffttPhaseId = phase ? ffttPhaseIdForName(phase.name) : null
    if (!organizationId || !phase || !ffttPhaseId) {
      setOrgDivisionIds(null)
      return
    }
    let cancelled = false
    fetchDivisionsPreview(organizationId, phase.seasonId, Number(ffttPhaseId)).then((result) => {
      if (cancelled) return
      setOrgDivisionIds(
        result && result !== 'no_contest'
          ? new Set(result.divisions.filter((d) => d.exists).map((d) => d.id))
          : new Set(),
      )
    })
    return () => { cancelled = true }
  }, [organizationId, phase, fetchDivisionsPreview])

  const orgGroups = useMemo(() => groupOrganizationsByType(orgs), [orgs])

  // Division — the actual scope of the page; reset whenever the phase or the
  // organization filter changes so a stale, now-hidden division can't linger.
  const [divisionId, setDivisionId] = useState('')
  useEffect(() => { setDivisionId('') }, [phase?.id, organizationId])

  const divisionsInPhase = useMemo(
    () =>
      divisions
        .filter((d) => d.phaseId === phase?.id && !d.isArchived)
        .filter((d) => !orgDivisionIds || orgDivisionIds.has(d.id))
        .sort((a, b) => a.rank - b.rank),
    [divisions, phase?.id, orgDivisionIds],
  )
  const division = divisionsInPhase.find((d) => d.id === divisionId)

  const [editing, setEditing] = useState<Group | null>(null)
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importGamesFor, setImportGamesFor] = useState<Group | null>(null)
  const [importDocOpen, setImportDocOpen] = useState(false)
  const [importDocForGroup, setImportDocForGroup] = useState<Group | null>(null)
  const [form, setForm] = useState({ divisionId: '', number: 1 })
  const [showArchived, setShowArchived] = useState(false)

  const activeGroups = useMemo(() => allGroups.filter((g) => !g.isArchived), [allGroups])
  const archivedGroups = useMemo(() => allGroups.filter((g) => g.isArchived), [allGroups])
  const visibleGroups = showArchived ? allGroups : activeGroups
  const groups = division
    ? visibleGroups.filter((g) => g.divisionId === division.id).sort((a, b) => a.number - b.number)
    : []

  const getTeamLabel = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return teamId
    const club = clubs.find((c) => c.id === team.clubId)
    return `${club?.displayName ?? team.clubId} ${team.number}`
  }

  const openEdit = (group: Group) => {
    setEditing(group)
    setCreating(false)
    setForm({ divisionId: group.divisionId, number: group.number })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    const divId = division?.id ?? divisions[0]?.id ?? ''
    setForm({
      divisionId: divId,
      number: allGroups.filter((g) => g.divisionId === divId).length + 1,
    })
  }

  const closeModal = () => {
    setEditing(null)
    setCreating(false)
  }

  const handleSave = () => {
    if (editing) {
      updateGroup(editing.id, { divisionId: form.divisionId, number: form.number })
      closeModal()
    } else if (creating && form.divisionId) {
      addGroup({
        divisionId: form.divisionId,
        number: form.number,
        teamIds: [],
        isArchived: false,
      })
      closeModal()
    }
  }

  const handleArchive = (group: Group) => {
    if (window.confirm(`Archiver le groupe "${division?.displayName ?? ''} - Groupe ${group.number}" ? Il ne sera plus visible dans la liste active.`)) {
      archiveGroup(group.id)
    }
  }

  const handleDelete = (group: Group) => {
    if (window.confirm(`Supprimer définitivement le groupe "${division?.displayName ?? ''} - Groupe ${group.number}" ? Les équipes, journées, matchs, disponibilités et compositions associés seront également supprimés. Cette action est irréversible.`)) {
      deleteGroup(group.id)
    }
  }

  const handleResetGames = (group: Group) => {
    if (window.confirm(`Réinitialiser les matchs du groupe "${division?.displayName ?? ''} - Groupe ${group.number}" ? Toutes les journées, tous les matchs et les disponibilités/compositions associées seront supprimés — les équipes du groupe seront conservées. Cette action est irréversible.`)) {
      resetGroupGames(group.id)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groupes"
        actions={
          <>
            <SecondaryButton onClick={openCreate}>Ajouter un groupe</SecondaryButton>
            {isAdmin && (
              <SecondaryButton onClick={() => setImportDocOpen(true)}>Importer depuis un fichier</SecondaryButton>
            )}
            {isAdmin && division && (
              <PrimaryButton onClick={() => setImportOpen(true)}>Importer les groupes FFTT</PrimaryButton>
            )}
          </>
        }
      />

      {/* Phase switcher */}
      {phase && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <PhaseSwitchButton
            dir="prev"
            disabled={phaseIndex <= 0}
            onClick={() => phaseIndex > 0 && setPhaseId(orderedPhases[phaseIndex - 1].id)}
          />
          <span className="font-display text-sm font-semibold text-slate-800">Saison {phase.displayName}</span>
          <PhaseSwitchButton
            dir="next"
            disabled={phaseIndex >= orderedPhases.length - 1}
            onClick={() => phaseIndex < orderedPhases.length - 1 && setPhaseId(orderedPhases[phaseIndex + 1].id)}
          />
        </div>
      )}

      {/* Organization (optional filter) + Division pickers */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="groups-org" className="block text-sm font-medium text-slate-700">
            Organisation <span className="font-normal text-slate-400">(filtre optionnel)</span>
          </label>
          <select
            id="groups-org"
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
        <div>
          <label htmlFor="groups-division" className="block text-sm font-medium text-slate-700">
            Division
          </label>
          <select
            id="groups-division"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            className="mt-1 min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          >
            <option value="">Choisir une division…</option>
            {divisionsInPhase.map((d) => (
              <option key={d.id} value={d.id}>{d.displayName}</option>
            ))}
          </select>
        </div>
      </div>

      {archivedGroups.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les groupes archivés ({archivedGroups.length})
          </span>
        </label>
      )}

      {!division ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Sélectionnez une division pour afficher ses groupes.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                  N° groupe
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                  Équipes
                </th>
                <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {groups.map((group) => (
                <tr key={group.id} className={`hover:bg-slate-50/50 ${group.isArchived ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {group.number}
                    {group.isArchived && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                        Archivé
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {group.teamIds.map(getTeamLabel).join(', ') || '—'}
                  </td>
                  <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                    <RowActions
                      label={`Actions — groupe ${group.number}`}
                      actions={[
                        !group.isArchived && { label: 'Modifier', onClick: () => openEdit(group) },
                        !group.isArchived && isAdmin && {
                          label: 'Importer les matchs',
                          onClick: () => setImportGamesFor(group),
                        },
                        !group.isArchived && isAdmin && {
                          label: 'Depuis un fichier',
                          onClick: () => setImportDocForGroup(group),
                        },
                        !group.isArchived && isAdmin && {
                          label: 'Réinitialiser les matchs',
                          tone: 'danger',
                          onClick: () => handleResetGames(group),
                        },
                        !group.isArchived && {
                          label: 'Archiver',
                          tone: 'danger',
                          onClick: () => handleArchive(group),
                        },
                        group.isArchived && {
                          label: 'Supprimer',
                          tone: 'danger',
                          onClick: () => handleDelete(group),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                    Aucun groupe pour cette division.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {importOpen && division && (
        <ImportGroupsModal
          onClose={() => setImportOpen(false)}
          divisionId={division.id}
          divisionName={division.displayName}
        />
      )}

      {importGamesFor && (
        <ImportGamesModal
          onClose={() => setImportGamesFor(null)}
          groupIds={[importGamesFor.id]}
          context={`${division?.displayName ?? ''} · Groupe ${importGamesFor.number} — calendrier de cette poule`}
        />
      )}

      {importDocOpen && (
        <ImportScheduleDocumentModal onClose={() => setImportDocOpen(false)} />
      )}

      {importDocForGroup && (
        <ImportScheduleDocumentModal
          onClose={() => setImportDocForGroup(null)}
          lockedGroupId={importDocForGroup.id}
        />
      )}

      {(editing || creating) && (
        <ModalShell
          onClose={closeModal}
          labelledBy="group-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="group-modal-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter un groupe' : 'Modifier le groupe'}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="group-divisionId" className="block text-sm font-medium text-slate-700">
                  Division
                </label>
                <select
                  id="group-divisionId"
                  value={form.divisionId}
                  onChange={(e) => setForm((f) => ({ ...f, divisionId: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>{d.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="group-number" className="block text-sm font-medium text-slate-700">
                  N° groupe
                </label>
                <input
                  id="group-number"
                  type="number"
                  min={1}
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: Number(e.target.value) || 1 }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
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
