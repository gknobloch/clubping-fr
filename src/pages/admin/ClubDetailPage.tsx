import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { ClubDetailView } from '@/components/ClubDetailView'
import { fetchClubDetailXmlFromBrowser, hasVenueInfo, parseClubDetailXml } from '@/lib/ffttClub'

type SyncState = 'idle' | 'loading' | 'done' | 'not_found' | 'error'

export function ClubDetailPage() {
  // Keyed on the club id, not the affiliation number (#275): the number is
  // optional since migration 0019, and clubs without one used to have no
  // reachable detail page at all.
  const { clubId } = useParams<{ clubId: string }>()
  const navigate = useNavigate()
  const { clubs, teams, players, archiveClub, updateClub, deleteClub, addClubAddress, updateClubAddress } = useAppData()
  const club = clubId != null ? clubs.find((c) => c.id === clubId) ?? null : null

  const [syncState, setSyncState] = useState<SyncState>('idle')

  if (!clubId || !club) {
    return (
      <div className="space-y-6">
        <p className="text-slate-600">Club introuvable.</p>
        <Link to="/clubs" className="text-sm font-medium text-accent-600 hover:text-accent-800">
          ← Retour à la liste des clubs
        </Link>
      </div>
    )
  }

  const handleArchive = () => {
    if (window.confirm(`Archiver le club "${club.displayName}" ? Il ne sera plus visible dans la liste active.`)) {
      archiveClub(club.id)
      navigate('/clubs')
    }
  }

  const handleActivate = () => {
    updateClub(club.id, { isArchived: false })
  }

  const hasDependents = teams.some((t) => t.clubId === club.id) || players.some((p) => p.clubId === club.id)

  const handleDelete = () => {
    if (hasDependents) return
    if (window.confirm(`Supprimer définitivement le club "${club.displayName}" ? Cette action est irréversible.`)) {
      deleteClub(club.id)
      navigate('/clubs')
    }
  }

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
    updateClub(club.id, { displayName: parsed.displayName })
    if (hasVenueInfo(parsed)) {
      const defaultAddress = (club.addresses ?? []).find((a) => a.isDefault)
      const patch = { label: parsed.venueLabel || 'Salle', street: parsed.street, postalCode: parsed.postalCode, city: parsed.city }
      if (defaultAddress) updateClubAddress(club.id, defaultAddress.id, patch)
      else addClubAddress(club.id, { ...patch, isDefault: true })
    }
    setSyncState('done')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/clubs"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800"
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
          className="mt-3 rounded-lg border border-accent-600 px-4 py-2 text-sm font-medium text-accent-600 hover:bg-accent-50 disabled:opacity-50"
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
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
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
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Réactiver ce club
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={hasDependents}
              title={hasDependents ? 'Ce club a des équipes ou des joueurs rattachés : impossible à supprimer.' : undefined}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
    </div>
  )
}
