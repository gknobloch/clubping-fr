import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Club } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { PageHeader } from '@/components/PageHeader'
import { PrimaryButton, SecondaryButton } from '@/components/Button'
import { ImportClubModal } from '@/components/ImportClubModal'

export function ClubsPage() {
  const navigate = useNavigate()
  const { clubs, addClub, archiveClub, updateClub, deleteClub, teams, players } = useAppData()
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({ affiliationNumber: '', displayName: '' })

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

  const handleArchive = (club: Club) => {
    if (window.confirm(`Archiver le club "${club.displayName}" ? Il ne sera plus visible dans la liste active.`)) {
      archiveClub(club.id)
    }
  }

  const handleActivate = (club: Club) => {
    updateClub(club.id, { isArchived: false })
  }

  const clubHasDependents = (club: Club) =>
    teams.some((t) => t.clubId === club.id) || players.some((p) => p.clubId === club.id)

  const handleDelete = (club: Club) => {
    if (clubHasDependents(club)) return
    if (window.confirm(`Supprimer définitivement le club "${club.displayName}" ? Cette action est irréversible.`)) {
      deleteClub(club.id)
    }
  }

  const closeCreateModal = () => {
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clubs"
        actions={
          <>
            <SecondaryButton onClick={openCreate}>Ajouter un club</SecondaryButton>
            <PrimaryButton onClick={() => setImportOpen(true)}>Importer depuis la FFTT</PrimaryButton>
          </>
        }
      />
      {archivedClubs.length > 0 && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span className="text-sm text-slate-600">
            Afficher les clubs archivés ({archivedClubs.length})
          </span>
        </label>
      )}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
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
              <th scope="col" className="px-4 py-3 text-right text-sm font-medium text-slate-700">
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
                <td className="px-4 py-3 text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => openEdit(club)}
                    className="text-sm font-medium text-accent-600 hover:text-accent-800"
                  >
                    Modifier
                  </button>
                  {!club.isArchived ? (
                    <button
                      type="button"
                      onClick={() => handleArchive(club)}
                      className="text-sm font-medium text-red-600 hover:text-red-800"
                    >
                      Archiver
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleActivate(club)}
                        className="text-sm font-medium text-green-700 hover:text-green-900"
                      >
                        Activer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(club)}
                        disabled={clubHasDependents(club)}
                        title={clubHasDependents(club) ? 'Ce club a des équipes ou des joueurs rattachés : archivez-le plutôt que de le supprimer.' : undefined}
                        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:text-slate-300"
                      >
                        Supprimer
                      </button>
                    </>
                  )}
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
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
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

      {importOpen && <ImportClubModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}
