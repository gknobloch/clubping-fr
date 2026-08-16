import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Club } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { PageHeader } from '@/components/PageHeader'
import { ImportIcon, PlusIcon } from '@/components/icons'
import { HeaderAction, NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'
import { ImportClubModal } from '@/components/ImportClubModal'
import { useConfirm } from '@/components/useConfirm'

export function ClubsPage() {
  const navigate = useNavigate()
  const { clubs, addClub, archiveClub, updateClub, deleteClub, teams, players } = useAppData()
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({ affiliationNumber: '', displayName: '' })
  const [confirm, confirmDialog] = useConfirm()

  const activeClubs = clubs.filter((c) => !c.isArchived)
  const archivedClubs = clubs.filter((c) => c.isArchived)
  const visibleClubs = showArchived ? clubs : activeClubs

  const openEdit = (club: Club) => {
    navigate(`/clubs/${encodeURIComponent(club.id)}`)
  }

  const openCreate = () => {
    setCreating(true)
    setForm({ affiliationNumber: '', displayName: '' })
  }

  const handleSave = () => {
    if (creating) {
      addClub({ ...form, isArchived: false, addresses: [], channels: [] })
      setCreating(false)
    }
  }

  const handleArchive = async (club: Club) => {
    if (await confirm({ title: `Archiver le club "${club.displayName}" ?`, message: `Il ne sera plus visible dans la liste active.`, confirmLabel: 'Archiver' })) {
      archiveClub(club.id)
    }
  }

  const handleActivate = (club: Club) => {
    updateClub(club.id, { isArchived: false })
  }

  const clubHasDependents = (club: Club) =>
    teams.some((t) => t.clubId === club.id) || players.some((p) => p.clubId === club.id)

  const handleDelete = async (club: Club) => {
    if (clubHasDependents(club)) return
    if (await confirm({ title: `Supprimer définitivement le club "${club.displayName}" ?`, message: `Cette action est irréversible.`, confirmLabel: 'Supprimer' })) {
      deleteClub(club.id)
    }
  }

  const closeCreateModal = () => {
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Clubs"
        actions={
          <>
            <HeaderAction variant="secondary" icon={<PlusIcon />} label="Ajouter un club" onClick={openCreate} />
            <HeaderAction icon={<ImportIcon />} label="Importer depuis la FFTT" onClick={() => setImportOpen(true)} />
          </>
        }
      />
      {archivedClubs.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les clubs archivés ({archivedClubs.length})
          </span>
        </label>
      )}
      {/* overflow-x-auto, not overflow-hidden: the corners still round off, but
          anything wider than the phone stays reachable by scrolling the table
          rather than being clipped out of existence (#305). */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                N° affiliation
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Nom
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Lieux de jeu
              </th>
              <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {visibleClubs.map((club) => (
              <tr key={club.id} className={`hover:bg-slate-50/50 ${club.isArchived ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm text-slate-900 font-mono">
                  {club.affiliationNumber}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {club.displayName}
                  {club.isArchived && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      Archivé
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {(club.addresses ?? []).map((a) => a.label).join(', ') || '—'}
                </td>
                <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                  <RowActions
                    label={`Actions — ${club.displayName}`}
                    actions={[
                      { label: 'Modifier', onClick: () => openEdit(club) },
                      !club.isArchived && {
                        label: 'Archiver',
                        tone: 'danger',
                        onClick: () => handleArchive(club),
                      },
                      club.isArchived && {
                        label: 'Activer',
                        tone: 'success',
                        onClick: () => handleActivate(club),
                      },
                      club.isArchived && {
                        label: 'Supprimer',
                        tone: 'danger',
                        onClick: () => handleDelete(club),
                        disabled: clubHasDependents(club),
                        title: clubHasDependents(club) ? 'Ce club a des équipes ou des joueurs rattachés : archivez-le plutôt que de le supprimer.' : undefined,
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <ModalShell
          onClose={closeCreateModal}
          labelledBy="create-club-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h2 id="create-club-title" className="font-display text-lg font-semibold text-slate-800">
              Ajouter un club
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="create-affiliationNumber"
                  className="block text-sm font-medium text-slate-700"
                >
                  N° affiliation
                </label>
                <input
                  id="create-affiliationNumber"
                  type="text"
                  value={form.affiliationNumber}
                  onChange={(e) => setForm((f) => ({ ...f, affiliationNumber: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <label
                  htmlFor="create-displayName"
                  className="block text-sm font-medium text-slate-700"
                >
                  Nom
                </label>
                <input
                  id="create-displayName"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
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

      {importOpen && <ImportClubModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}
