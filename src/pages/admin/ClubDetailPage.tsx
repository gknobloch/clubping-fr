import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { ClubDetailView } from '@/components/ClubDetailView'
import { ClubAdmins } from '@/components/ClubAdmins'
import { ClubCompetitions } from '@/components/ClubCompetitions'
import { ClubImportPreview } from '@/components/ClubImportPreview'
import { ModalShell } from '@/components/ModalShell'
import { BASE_BUTTON_CLASS, DANGER_BUTTON_CLASS, NEUTRAL_BUTTON_CLASS, OUTLINE_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { useConfirm } from '@/components/useConfirm'
import {
  clubSyncFields, defaultSelectedFields, fetchClubDetailXmlFromBrowser, parseClubDetailXml,
  type ClubSyncField, type FfttClubDetail,
} from '@/lib/ffttClub'

type SyncState = 'idle' | 'loading' | 'done' | 'not_found' | 'error'

export function ClubDetailPage() {
  // Keyed on the club id, not the affiliation number (#275): the number is
  // optional since migration 0019, and clubs without one used to have no
  // reachable detail page at all.
  const { clubId } = useParams<{ clubId: string }>()
  const navigate = useNavigate()
  const { clubs, teams, players, archiveClub, updateClub, deleteClub, addClubAddress, updateClubAddress } = useAppData()
  const club = clubId != null ? clubs.find((c) => c.id === clubId) ?? null : null
  const [confirm, confirmDialog] = useConfirm()

  const [syncState, setSyncState] = useState<SyncState>('idle')
  // Nothing is written until the preview is confirmed (#280).
  const [preview, setPreview] = useState<{ detail: FfttClubDetail; fields: ClubSyncField[] } | null>(null)
  const [selected, setSelected] = useState<Set<ClubSyncField['key']>>(new Set())

  if (!clubId || !club) {
    return (
      <div className="space-y-6">
        {confirmDialog}
        <p className="text-slate-600">Club introuvable.</p>
        <Link to="/clubs" className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}>
          ← Retour à la liste des clubs
        </Link>
      </div>
    )
  }

  const handleArchive = async () => {
    if (await confirm({ title: `Archiver le club "${club.displayName}" ?`, message: `Il ne sera plus visible dans la liste active.`, confirmLabel: 'Archiver' })) {
      archiveClub(club.id)
      navigate('/clubs')
    }
  }

  const handleActivate = () => {
    updateClub(club.id, { isArchived: false })
  }

  const hasDependents = teams.some((t) => t.clubId === club.id) || players.some((p) => p.clubId === club.id)

  const handleDelete = async () => {
    if (hasDependents) return
    if (await confirm({ title: `Supprimer définitivement le club "${club.displayName}" ?`, message: `Cette action est irréversible.`, confirmLabel: 'Supprimer' })) {
      deleteClub(club.id)
      navigate('/clubs')
    }
  }

  const defaultAddress = (club.addresses ?? []).find((a) => a.isDefault)

  const handleSync = async () => {
    setSyncState('loading')
    const xml = await fetchClubDetailXmlFromBrowser(club.affiliationNumber)
    if (xml === null) {
      setSyncState('error')
      return
    }
    const parsed = parseClubDetailXml(xml)
    if (!parsed) {
      setSyncState('not_found')
      return
    }
    const fields = clubSyncFields(parsed, {
      displayName: club.displayName,
      venue: defaultAddress
        ? {
            label: defaultAddress.label, street: defaultAddress.street,
            postalCode: defaultAddress.postalCode, city: defaultAddress.city,
          }
        : null,
    })
    setPreview({ detail: parsed, fields })
    setSelected(defaultSelectedFields(fields))
    setSyncState('idle')
  }

  const toggleField = (key: ClubSyncField['key']) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const applySync = () => {
    if (!preview) return
    const { detail } = preview
    if (selected.has('displayName')) updateClub(club.id, { displayName: detail.displayName })
    if (selected.has('venue')) {
      const patch = {
        label: detail.venueLabel || 'Salle', street: detail.street,
        postalCode: detail.postalCode, city: detail.city,
      }
      if (defaultAddress) updateClubAddress(club.id, defaultAddress.id, patch)
      else addClubAddress(club.id, { ...patch, isDefault: true })
    }
    setPreview(null)
    setSyncState('done')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/clubs"
          className={`items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800 ${TEXT_TARGET_CLASS}`}
        >
          ← Retour à la liste des clubs
        </Link>
        <h1 className="font-display text-2xl font-semibold text-slate-800">
          {club.displayName}
          {club.isArchived && (
            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-sm font-normal text-slate-600">
              Archivé
            </span>
          )}
        </h1>
      </div>
      {/* The URL is the club id, so editing the affiliation number no longer
          invalidates it and no post-save re-navigation is needed (#275). */}
      <ClubDetailView
        club={club}
        canEdit={!club.isArchived}
        canEditAffiliationNumber
        idPrefix="admin-club"
      />

      {/* Who runs this club (#474). Archived clubs keep the list visible but
          not editable — the same reasoning as the detail view above. */}
      <ClubAdmins clubId={club.id} idPrefix="admin-club" />
      <ClubCompetitions clubId={club.id} idPrefix="admin-club" />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium text-slate-800">Synchronisation FFTT</h2>
        <p className="mt-1 text-sm text-slate-600">
          {club.affiliationNumber
            ? `Récupère à nouveau le nom et le lieu de jeu de ce club depuis la FFTT (n° ${club.affiliationNumber}).`
            : 'Renseignez le numéro d’affiliation ci-dessus pour pouvoir synchroniser ce club depuis la FFTT.'}
        </p>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncState === 'loading' || !club.affiliationNumber}
          className={`mt-3 border border-accent-600 text-accent-600 hover:bg-accent-50 ${OUTLINE_BUTTON_CLASS}`}
        >
          {syncState === 'loading' ? 'Synchronisation…' : 'Synchroniser depuis la FFTT'}
        </button>
        {syncState === 'done' && <p className="mt-2 text-sm text-green-700">Club synchronisé.</p>}
        {syncState === 'not_found' && (
          <p className="mt-2 text-sm text-slate-600">Aucun club trouvé sur la FFTT pour ce numéro d’affiliation.</p>
        )}
        {syncState === 'error' && (
          <p className="mt-2 text-sm text-red-600">Impossible de contacter la FFTT. Réessayez plus tard.</p>
        )}
      </div>

      {!club.isArchived ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-sm font-medium text-red-800">Zone dangereuse</h2>
          <p className="mt-1 text-sm text-red-700">
            Archiver ce club le masquera de la liste active. Cette action est réversible.
          </p>
          <button
            type="button"
            onClick={handleArchive}
            className={`mt-3 ${DANGER_BUTTON_CLASS}`}
          >
            Archiver ce club
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-red-800">Zone dangereuse</h2>
            <p className="mt-1 text-sm text-red-700">
              Ce club est archivé. Réactivez-le pour le rendre à nouveau modifiable, ou supprimez-le définitivement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleActivate}
              className={`bg-green-700 text-white hover:bg-green-800 ${BASE_BUTTON_CLASS}`}
            >
              Réactiver ce club
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={hasDependents}
              title={hasDependents ? 'Ce club a des équipes ou des joueurs rattachés : impossible à supprimer.' : undefined}
              className={`disabled:cursor-not-allowed disabled:bg-slate-300 ${DANGER_BUTTON_CLASS}`}
            >
              Supprimer définitivement
            </button>
          </div>
          {hasDependents && (
            <p className="text-sm text-red-700">
              Ce club a des équipes ou des joueurs rattachés : archivage permanent uniquement, pas de suppression.
            </p>
          )}
        </div>
      )}

      {preview && (
        <ModalShell
          onClose={() => setPreview(null)}
          labelledBy="sync-preview-title"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <h2 id="sync-preview-title" className="font-display text-lg font-semibold text-slate-800">
              Synchroniser depuis la FFTT
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choisissez ce que vous voulez reprendre pour « {club.displayName} ». Rien n’est modifié tant que vous
              n’avez pas confirmé.
            </p>
            <div className="mt-4">
              <ClubImportPreview fields={preview.fields} selected={selected} onToggle={toggleField} />
            </div>
            {selected.size === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                Rien de sélectionné : il n’y a aucune modification à appliquer.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className={NEUTRAL_BUTTON_CLASS}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={applySync}
                disabled={selected.size === 0}
                className={PRIMARY_BUTTON_CLASS}
              >
                Appliquer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
